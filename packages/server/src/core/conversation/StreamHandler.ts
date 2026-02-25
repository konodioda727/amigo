import type { ChatMessage, UserMessageAttachment } from "@amigo-llm/types";
import { systemReservedTags } from "@amigo-llm/types";
import { AIMessage, type BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import pWaitFor from "p-wait-for";
import { isWhitespaceOnly } from "@/utils/isWhiteSpaceOnly";
import { logger } from "@/utils/logger";
import { parseStreamingXml } from "@/utils/parseStreamingXml";
import { getConfiguredAutoApproveToolNames } from "./autoApproveTools";
import type { Conversation } from "./Conversation";
import type { ToolExecutor } from "./ToolExecutor";
import { broadcaster } from "./WebSocketBroadcaster";

const isGoogleGenAIModel = (llm: Conversation["llm"]) =>
  llm?.constructor?.name === "ChatGoogleGenerativeAI" ||
  process.env.MODEL_NAME?.toLowerCase().includes("gemini");

const toAttachmentContentBlock = (attachment: UserMessageAttachment, llm: Conversation["llm"]) => {
  const isGoogle = isGoogleGenAIModel(llm);

  if (!isGoogle && attachment.url) {
    if (attachment.kind === "image") {
      return {
        type: "image_url" as const,
        image_url: { url: attachment.url },
      };
    }

    if (attachment.kind === "video") {
      return {
        type: "video_url" as const,
        video_url: { url: attachment.url },
      };
    }

    // Many OpenAI-compatible chat-completions providers don't support generic file/audio URL parts.
    return {
      type: "text" as const,
      text: `Attachment URL (${attachment.kind}): ${attachment.name} ${attachment.url}`,
    };
  }

  const common = {
    mimeType: attachment.mimeType,
    url: attachment.url,
    metadata: {
      fileName: attachment.name,
      size: attachment.size,
    },
  };

  if (attachment.kind === "image") {
    return { type: "image" as const, ...common };
  }

  if (attachment.kind === "audio") {
    return { type: "audio" as const, ...common };
  }

  if (attachment.kind === "video") {
    if (isGoogleGenAIModel(llm)) {
      return { type: "video" as const, ...common };
    }
    // ChatOpenAI completions converter currently does not map "video" blocks, downgrade to file.
    return { type: "file" as const, ...common };
  }

  return { type: "file" as const, ...common };
};

const toHumanMessageContent = (
  message: ChatMessage,
  llm: Conversation["llm"],
): string | Array<Record<string, unknown>> => {
  if (!message.attachments || message.attachments.length === 0) {
    return message.content;
  }

  const blocks: Array<Record<string, unknown>> = [];
  if (message.content.trim()) {
    blocks.push({ type: "text", text: message.content });
  }

  for (const attachment of message.attachments) {
    const block = toAttachmentContentBlock(attachment, llm);
    if (block) {
      blocks.push(block);
    }
  }

  return blocks;
};

const toModelMessages = (messages: ChatMessage[], llm: Conversation["llm"]): BaseMessage[] => {
  if (isGoogleGenAIModel(llm)) {
    let firstSystemContent: string | null = null;
    const transformed: BaseMessage[] = [];

    for (const message of messages) {
      if (message.role === "system") {
        if (!firstSystemContent) {
          firstSystemContent = message.content;
          continue;
        }
        transformed.push(new HumanMessage({ content: `SYSTEM NOTICE:\n${message.content}` }));
        continue;
      }

      if (message.role === "assistant") {
        transformed.push(new AIMessage({ content: message.content }));
      } else {
        transformed.push(new HumanMessage({ content: toHumanMessageContent(message, llm) as any }));
      }
    }

    if (firstSystemContent) {
      return [new SystemMessage({ content: firstSystemContent }), ...transformed];
    }

    return transformed;
  }

  return messages.map((message) => {
    switch (message.role) {
      case "system":
        return new SystemMessage({ content: message.content });
      case "assistant":
        return new AIMessage({ content: message.content });
      case "user":
      default:
        return new HumanMessage({ content: toHumanMessageContent(message, llm) as any });
    }
  });
};

/**
 * 流处理器 - 负责处理 LLM 流式响应
 */
export class StreamHandler {
  private consecutiveErrorCount = 0;

  constructor(private toolExecutor: ToolExecutor) {}

  /**
   * 重置连续错误计数
   */
  resetErrorCount(): void {
    this.consecutiveErrorCount = 0;
  }

  /**
   * 处理流式响应
   */
  async handleStream(
    conversation: Conversation,
    abortController: AbortController,
  ): Promise<string> {
    if (conversation.isAborted) {
      logger.info("检测到中断状态，停止 handleStream");
      throw new Error("interrupt");
    }

    try {
      const stream = await conversation.llm.stream(
        toModelMessages(conversation.memory.messages, conversation.llm),
        {
          signal: abortController.signal,
        },
      );

      const startLabels = this.buildStartLabels(conversation);
      const callbacks = this.createStreamCallbacks(conversation, abortController);

      // 重置工具错误标志
      this.toolExecutor.resetToolError();

      const currentTool = await parseStreamingXml({
        stream,
        startLabels,
        signal: abortController.signal,
        ...callbacks,
      });

      if (currentTool === "interrupt") {
        logger.info("\n会话已通过打断信号结束。");
        return "interrupt";
      }

      this.consecutiveErrorCount = 0;
      return currentTool;
    } catch (error: unknown) {
      const err = error as Error & { name?: string };
      if (
        err.name === "AbortError" ||
        conversation.isAborted ||
        err.message === "interrupt" ||
        abortController.signal.aborted
      ) {
        logger.info("流式响应被用户中断");
        return "interrupt";
      }

      await this.handleError(conversation, err);
      return "interrupt";
    }
  }

  /**
   * 构建 XML 解析的起始标签
   */
  private buildStartLabels(conversation: Conversation): string[] {
    return conversation.toolService.toolNames.concat(systemReservedTags).map((name) => `<${name}>`);
  }

  /**
   * 创建流解析回调
   */
  private createStreamCallbacks(conversation: Conversation, abortController: AbortController) {
    const shouldAutoApprove = (toolName: string) => {
      if (conversation.type === "sub") {
        return true;
      }
      const configured = conversation.memory.autoApproveToolNames;
      const names = configured.length > 0 ? configured : getConfiguredAutoApproveToolNames();
      return names.includes(toolName);
    };

    return {
      onPartialMessageFound: async (message: string) => {
        if (conversation.isAborted || conversation.status === "aborted") {
          return;
        }
        broadcaster.postMessage(conversation, {
          role: "assistant",
          content: message,
          type: "message",
          partial: true,
        });
      },
      onMessageLeft: async (message: string) => {
        if (conversation.isAborted || conversation.status === "aborted") {
          return;
        }
        console.log("[StreamHandler] onMessageLeft 被调用，message:", JSON.stringify(message));
        console.log("[StreamHandler] isWhitespaceOnly:", isWhitespaceOnly(message));
      },
      onCommonMessageFound: async (message: string) => {
        if (conversation.isAborted || conversation.status === "aborted") {
          return;
        }
        broadcaster.postMessage(conversation, {
          role: "assistant",
          content: message,
          type: "message",
          partial: false,
        });
      },
      onFullToolCallFound: async (
        fullToolCall: string,
        currentTool: string,
        currentType: ChatMessage["type"],
      ) => {
        console.log("[StreamHandler] onFullToolCallFound 被调用");
        console.log("[StreamHandler] currentTool:", currentTool);
        console.log("[StreamHandler] isAutoApprove:", shouldAutoApprove(currentTool));

        if (
          conversation.isAborted ||
          conversation.status === "aborted" ||
          abortController.signal.aborted
        ) {
          logger.info("[StreamHandler] onFullToolCallFound 检测到中断，忽略工具执行");
          return;
        }

        if (shouldAutoApprove(currentTool)) {
          conversation.status = "tool_executing";
          console.log("[StreamHandler] 开始执行自动批准的工具:", currentTool);
          await this.toolExecutor.executeToolCall(
            conversation,
            fullToolCall,
            currentTool,
            currentType,
            abortController.signal,
          );
          console.log("[StreamHandler] 工具执行完成:", currentTool);
        } else {
          logger.info(`[StreamHandler] Pausing for confirmation of tool: ${currentTool}`);

          // Parse params
          const { params } = conversation.toolService.parseParams(fullToolCall, true);

          conversation.status = "waiting_tool_confirmation";
          conversation.pendingToolCall = {
            toolName: currentTool,
            params,
            fullToolCall,
            type: currentType,
          };
          // 只广播，不保存到消息历史（已保存在 taskStatus.json 的 pendingToolCall 中）
          broadcaster.broadcast(conversation.id, {
            type: "waiting_tool_call",
            data: {
              toolName: currentTool,
              params,
              taskId: conversation.id,
              updateTime: Date.now(),
            },
          });
        }
      },
      onPartialToolCallFound: async (
        partialToolCall: string,
        currentTool: string,
        currentType: ChatMessage["type"],
      ) => {
        if (conversation.isAborted || conversation.status === "aborted") {
          return;
        }
        this.toolExecutor.handlePartialToolCall(
          conversation,
          partialToolCall,
          currentTool,
          currentType,
        );
      },
    };
  }

  /**
   * 处理错误
   */
  private async handleError(conversation: Conversation, error: Error): Promise<void> {
    this.consecutiveErrorCount++;
    logger.error(`流式响应过程中出现错误 (${this.consecutiveErrorCount}/3):`, error);

    broadcaster.postMessage(conversation, {
      type: "error",
      role: "system",
      content: error.message,
    });

    broadcaster.broadcast(conversation.id, {
      type: "conversationOver",
      data: {
        reason: "error",
      },
    });

    if (this.consecutiveErrorCount >= 3) {
      await this.handleConsecutiveErrors(conversation, error);
    }

    conversation.status = "error";
  }

  /**
   * 处理连续错误
   */
  private async handleConsecutiveErrors(conversation: Conversation, error: Error): Promise<void> {
    logger.warn("⚠️  连续出现3次错误，需要用户确认是否继续");

    conversation.status = "error";
    conversation.userInput = "";

    broadcaster.emitAndSave(conversation, {
      type: "alert",
      data: {
        message: `连续出现 ${this.consecutiveErrorCount} 次错误，最后一次错误：${error.message}\n\n是否继续尝试？请输入新的指令或调整任务。`,
        severity: "error",
        updateTime: Date.now(),
      },
    });

    this.consecutiveErrorCount = 0;
    await pWaitFor(() => !!conversation.userInput);
  }
}

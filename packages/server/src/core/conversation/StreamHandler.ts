import type { ChatMessage, UserMessageAttachment } from "@amigo-llm/types";
import { systemReservedTags } from "@amigo-llm/types";
import pWaitFor from "p-wait-for";
import type { AmigoMessageContentPart, AmigoModelMessage } from "@/core/model";
import { isWhitespaceOnly } from "@/utils/isWhiteSpaceOnly";
import { logger } from "@/utils/logger";
import { getConfiguredAutoApproveToolNames } from "./autoApproveTools";
import type { Conversation } from "./Conversation";
import type { NativeToolCall, ToolExecutor } from "./ToolExecutor";
import { broadcaster } from "./WebSocketBroadcaster";

const isGoogleGenAIModel = (llm: Conversation["llm"]) => llm.provider === "google-genai";

const toAttachmentContentBlock = (attachment: UserMessageAttachment): AmigoMessageContentPart => {
  const common = {
    mimeType: attachment.mimeType,
    url: attachment.url,
    name: attachment.name,
    size: attachment.size,
  };

  switch (attachment.kind) {
    case "image":
      return { type: "image", ...common };
    case "audio":
      return { type: "audio", ...common };
    case "video":
      return { type: "video", ...common };
    case "file":
    default:
      return { type: "file", ...common };
  }
};

const toHumanMessageContent = (message: ChatMessage): string | AmigoMessageContentPart[] => {
  if (!message.attachments || message.attachments.length === 0) {
    return message.content;
  }

  const blocks: AmigoMessageContentPart[] = [];
  if (message.content.trim()) {
    blocks.push({ type: "text", text: message.content });
  }

  for (const attachment of message.attachments) {
    const block = toAttachmentContentBlock(attachment);
    if (block) {
      blocks.push(block);
    }
  }

  return blocks;
};

const toModelMessages = (
  messages: ChatMessage[],
  llm: Conversation["llm"],
): AmigoModelMessage[] => {
  if (isGoogleGenAIModel(llm)) {
    let firstSystemContent: string | null = null;
    const transformed: AmigoModelMessage[] = [];

    for (const message of messages) {
      if (message.role === "system") {
        if (!firstSystemContent) {
          firstSystemContent = message.content;
          continue;
        }
        transformed.push({ role: "user", content: `SYSTEM NOTICE:\n${message.content}` });
        continue;
      }

      if (message.role === "assistant") {
        transformed.push({ role: "assistant", content: message.content });
      } else {
        transformed.push({
          role: "user",
          content: toHumanMessageContent(message),
        });
      }
    }

    if (firstSystemContent) {
      return [{ role: "system", content: firstSystemContent }, ...transformed];
    }

    return transformed;
  }

  return messages.map((message): AmigoModelMessage => {
    switch (message.role) {
      case "system":
        return { role: "system", content: message.content };
      case "assistant":
        return { role: "assistant", content: message.content };
      case "user":
      default:
        return { role: "user", content: toHumanMessageContent(message) };
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
          tools: conversation.toolService.getToolDefinitions(),
        },
      );

      // 重置工具错误标志
      this.toolExecutor.resetToolError();

      let messageBuffer = "";
      let currentTool = "message";

      for await (const event of stream) {
        if (
          conversation.isAborted ||
          conversation.status === "aborted" ||
          abortController.signal.aborted
        ) {
          logger.info("[StreamHandler] 检测到中断，停止处理流事件");
          return "interrupt";
        }

        if (event.type === "text_delta") {
          if (!event.text) {
            continue;
          }
          messageBuffer += event.text;
          this.emitPartialMessage(conversation, messageBuffer);
          continue;
        }

        if (event.type === "tool_call_delta") {
          continue;
        }

        if (event.type !== "tool_call_done") {
          continue;
        }

        currentTool = event.name;
        const currentType = this.getToolCallMessageType(event.name);
        const toolCall: NativeToolCall = {
          toolCallId: event.toolCallId,
          name: event.name,
          arguments: event.arguments || {},
        };

        this.emitFinalMessage(conversation, messageBuffer);
        messageBuffer = "";

        if (this.shouldAutoApprove(conversation, event.name)) {
          conversation.status = "tool_executing";
          await this.toolExecutor.executeToolCall(
            conversation,
            toolCall,
            currentType,
            abortController.signal,
          );
        } else {
          logger.info(`[StreamHandler] Pausing for confirmation of tool: ${event.name}`);
          conversation.status = "waiting_tool_confirmation";
          conversation.pendingToolCall = {
            toolName: event.name,
            params: toolCall.arguments,
            toolCallId: toolCall.toolCallId,
            type: currentType,
          };
          broadcaster.broadcast(conversation.id, {
            type: "waiting_tool_call",
            data: {
              toolName: event.name,
              params: toolCall.arguments,
              taskId: conversation.id,
              updateTime: Date.now(),
            },
          });
        }

        return currentTool;
      }

      this.emitFinalMessage(conversation, messageBuffer);

      this.consecutiveErrorCount = 0;
      return currentTool || "message";
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

  private shouldAutoApprove(conversation: Conversation, toolName: string): boolean {
    if (conversation.type === "sub") {
      return true;
    }
    const configured = conversation.memory.autoApproveToolNames;
    const names = configured.length > 0 ? configured : getConfiguredAutoApproveToolNames();
    return names.includes(toolName);
  }

  private getToolCallMessageType(toolName: string): ChatMessage["type"] {
    if (systemReservedTags.includes(toolName as (typeof systemReservedTags)[number])) {
      return toolName as ChatMessage["type"];
    }
    return "tool";
  }

  private emitPartialMessage(conversation: Conversation, message: string): void {
    if (conversation.isAborted || conversation.status === "aborted") {
      return;
    }
    if (isWhitespaceOnly(message)) {
      return;
    }
    broadcaster.postMessage(conversation, {
      role: "assistant",
      content: message,
      type: "message",
      partial: true,
    });
  }

  private emitFinalMessage(conversation: Conversation, message: string): void {
    if (conversation.isAborted || conversation.status === "aborted") {
      return;
    }
    if (isWhitespaceOnly(message)) {
      return;
    }
    broadcaster.postMessage(conversation, {
      role: "assistant",
      content: message,
      type: "message",
      partial: false,
    });
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

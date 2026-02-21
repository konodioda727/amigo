import type { ChatMessage } from "@amigo-llm/types";
import { systemReservedTags } from "@amigo-llm/types";
import pWaitFor from "p-wait-for";
import { isWhitespaceOnly } from "@/utils/isWhiteSpaceOnly";
import { logger } from "@/utils/logger";
import { parseStreamingXml } from "@/utils/parseStreamingXml";
import type { Conversation } from "./Conversation";
import type { ToolExecutor } from "./ToolExecutor";
import { broadcaster } from "./WebSocketBroadcaster";

/**
 * 流处理器 - 负责处理 LLM 流式响应
 */
export class StreamHandler {
  private consecutiveErrorCount = 0;

  // 自动批准的工具列表，无需用户确认
  private autoApproveTools = new Set([
    "completionResult",
    "think",
    "askFollowupQuestion",
    "completeTask",
  ]);

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
      const stream = await conversation.llm.stream(conversation.memory.messages, {
        signal: abortController.signal,
      });

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
        throw new Error("interrupt");
      }

      this.consecutiveErrorCount = 0;
      return currentTool;
    } catch (error: unknown) {
      const err = error as Error & { name?: string };
      if (err.name === "AbortError" || conversation.isAborted || err.message === "interrupt") {
        logger.info("流式响应被用户中断");
        throw err;
      }

      await this.handleError(conversation, err);
      throw err;
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
    return {
      onPartialMessageFound: async (message: string) => {
        broadcaster.postMessage(conversation, {
          role: "assistant",
          content: message,
          type: "message",
          partial: true,
        });
      },
      onMessageLeft: async (message: string) => {
        console.log("[StreamHandler] onMessageLeft 被调用，message:", JSON.stringify(message));
        console.log("[StreamHandler] isWhitespaceOnly:", isWhitespaceOnly(message));
      },
      onCommonMessageFound: async (message: string) => {
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
        console.log("[StreamHandler] isAutoApprove:", this.autoApproveTools.has(currentTool));

        if (this.autoApproveTools.has(currentTool)) {
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

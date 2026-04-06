import type { ChatMessage } from "@amigo-llm/types";
import { systemReservedTags } from "@amigo-llm/types";
import pWaitFor from "p-wait-for";
import { logger } from "@/utils/logger";
import { clearConversationContinuations } from "./asyncContinuations";
import { getConfiguredAutoApproveToolNames } from "./autoApproveTools";
import { contextCompressionManager } from "./ContextCompressionManager";
import type { Conversation } from "./Conversation";
import { StreamTransport } from "./StreamTransport";
import type { NativeToolCall, ToolExecutor } from "./ToolExecutor";
import { broadcaster } from "./WebSocketBroadcaster";

/**
 * 流处理器 - 负责处理 LLM 流式响应
 */
export class StreamHandler {
  private consecutiveErrorCount = 0;
  private readonly transport = new StreamTransport();

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
      const preparedMessages = await contextCompressionManager.prepareMessages(
        conversation,
        abortController.signal,
      );
      const stream = await conversation.llm.stream(preparedMessages, {
        signal: abortController.signal,
        tools: conversation.toolService.getToolDefinitions(),
      });

      // 重置工具错误标志
      this.toolExecutor.resetToolError();

      let messageBuffer = "";
      let reasoningBuffer = "";
      let reasoningUpdateTime: number | null = null;
      let reasoningFinalized = false;
      let toolCallStarted = false;
      let currentTool = "message";
      const completedToolCalls: ResolvedToolCall[] = [];

      for await (const event of stream) {
        if (
          conversation.isAborted ||
          conversation.status === "aborted" ||
          abortController.signal.aborted
        ) {
          logger.info("[StreamHandler] 检测到中断，停止处理流事件");
          if (!reasoningFinalized) {
            this.transport.emitFinalThink(conversation, reasoningBuffer, reasoningUpdateTime);
            reasoningFinalized = true;
          }
          return "interrupt";
        }

        if (event.type === "reasoning_delta") {
          if (toolCallStarted) {
            continue;
          }
          if (!event.text) {
            continue;
          }
          if (reasoningFinalized) {
            reasoningBuffer = "";
            reasoningUpdateTime = null;
            reasoningFinalized = false;
          }
          reasoningBuffer += event.text;
          reasoningUpdateTime = this.transport.emitPartialThink(
            conversation,
            reasoningBuffer,
            reasoningUpdateTime,
          );
          continue;
        }

        if (event.type === "text_delta") {
          if (toolCallStarted) {
            continue;
          }
          if (!event.text) {
            continue;
          }
          if (!reasoningFinalized) {
            this.transport.emitFinalThink(conversation, reasoningBuffer, reasoningUpdateTime);
            reasoningFinalized = true;
          }
          messageBuffer += event.text;
          this.transport.emitPartialMessage(conversation, messageBuffer);
          continue;
        }

        if (event.type === "tool_call_delta") {
          if (!event.name) {
            continue;
          }
          toolCallStarted = true;
          if (!reasoningFinalized) {
            this.transport.emitFinalThink(conversation, reasoningBuffer, reasoningUpdateTime);
            reasoningFinalized = true;
          }
          this.transport.emitFinalMessage(conversation, messageBuffer);
          messageBuffer = "";
          reasoningBuffer = "";
          reasoningUpdateTime = null;

          const currentType = this.getToolCallMessageType(event.name);
          const partialArguments =
            event.partialArguments &&
            typeof event.partialArguments === "object" &&
            !Array.isArray(event.partialArguments)
              ? event.partialArguments
              : {};
          this.transport.emitPartialToolCallDraft(
            conversation,
            currentType,
            event.name,
            event.toolCallId,
            partialArguments,
          );
          continue;
        }

        if (event.type !== "tool_call_done") {
          continue;
        }

        currentTool = event.name;
        const currentType = this.getToolCallMessageType(event.name);
        const toolDraftUpdateTime = this.transport.consumeToolDraftUpdateTime(
          conversation.id,
          event.name,
          event.toolCallId,
        );
        if (!reasoningFinalized) {
          this.transport.emitFinalThink(conversation, reasoningBuffer, reasoningUpdateTime);
          reasoningFinalized = true;
        }
        this.transport.emitFinalMessage(conversation, messageBuffer);
        messageBuffer = "";
        reasoningBuffer = "";
        reasoningUpdateTime = null;
        reasoningFinalized = false;

        completedToolCalls.push({
          toolName: event.name,
          params: event.arguments || {},
          toolCallId: event.toolCallId,
          type: currentType,
          updateTime: toolDraftUpdateTime ?? Date.now(),
        });
      }

      if (completedToolCalls.length > 0) {
        currentTool = await this.processToolCalls(
          conversation,
          completedToolCalls,
          abortController.signal,
        );
      }

      if (!reasoningFinalized) {
        this.transport.emitFinalThink(conversation, reasoningBuffer, reasoningUpdateTime);
      }
      if (!toolCallStarted) {
        this.transport.emitFinalMessage(conversation, messageBuffer);
      }
      contextCompressionManager.syncContextUsage(conversation);

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
    } finally {
      this.transport.cleanupToolDrafts(conversation.id);
    }
  }

  async processToolCalls(
    conversation: Conversation,
    toolCalls: ResolvedToolCall[],
    abortSignal?: AbortSignal,
  ): Promise<string> {
    let currentTool = "message";

    for (let index = 0; index < toolCalls.length; index += 1) {
      const toolCall = toolCalls[index];
      if (!toolCall) {
        continue;
      }

      currentTool = toolCall.toolName;

      if (!this.shouldAutoApprove(conversation, toolCall.toolName)) {
        this.pauseForToolConfirmation(conversation, toolCall, toolCalls.slice(index + 1));
        return currentTool;
      }

      conversation.status = "tool_executing";
      await this.toolExecutor.executeToolCall(
        conversation,
        {
          toolCallId: toolCall.toolCallId,
          name: toolCall.toolName,
          arguments:
            toolCall.params &&
            typeof toolCall.params === "object" &&
            !Array.isArray(toolCall.params)
              ? (toolCall.params as Record<string, unknown>)
              : {},
        } satisfies NativeToolCall,
        toolCall.type,
        abortSignal,
        toolCall.updateTime,
      );

      if (conversation.isAborted || abortSignal?.aborted) {
        break;
      }
    }

    return currentTool;
  }

  private shouldAutoApprove(conversation: Conversation, toolName: string): boolean {
    if (conversation.type === "sub") {
      // Spec workflow requires explicit user review before a sub-task can finalize.
      if (toolName === "completeTask") {
        return false;
      }
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

  private pauseForToolConfirmation(
    conversation: Conversation,
    toolCall: ResolvedToolCall,
    queuedToolCalls: ResolvedToolCall[],
  ): void {
    logger.info(`[StreamHandler] Pausing for confirmation of tool: ${toolCall.toolName}`);
    conversation.status = "waiting_tool_confirmation";
    conversation.pendingToolCall = {
      ...toolCall,
      queuedToolCalls: queuedToolCalls.length > 0 ? queuedToolCalls : undefined,
    } as NonNullable<Conversation["pendingToolCall"]>;
    broadcaster.broadcastConversation(conversation, {
      type: "waiting_tool_call",
      data: {
        taskId: conversation.id,
        toolName: toolCall.toolName,
        params: toolCall.params,
        updateTime: toolCall.updateTime,
      },
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

    broadcaster.broadcastConversation(conversation, {
      type: "conversationOver",
      data: {
        reason: "error",
      },
    });

    if (this.consecutiveErrorCount >= 3) {
      await this.handleConsecutiveErrors(conversation, error);
    }

    conversation.status = "error";
    clearConversationContinuations(conversation.id);
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
    clearConversationContinuations(conversation.id);
    await pWaitFor(() => !!conversation.userInput);
  }
}

type ResolvedToolCall = {
  toolName: string;
  params: unknown;
  toolCallId?: string;
  type: ChatMessage["type"];
  updateTime?: number;
};

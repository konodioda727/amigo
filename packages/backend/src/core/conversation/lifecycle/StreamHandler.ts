import type { ChatMessage } from "@amigo-llm/types";
import { systemReservedTags } from "@amigo-llm/types";
import pWaitFor from "p-wait-for";
import { logger } from "@/utils/logger";
import type { Conversation } from "../Conversation";
import { clearConversationContinuations } from "../context/asyncContinuations";
import { getConfiguredAutoApproveToolNames } from "../context/autoApproveTools";
import { contextCompressionManager } from "../context/ContextCompressionManager";
import { createModelContextDebugSession } from "../context/modelContextDebugLogger";
import { StreamTransport } from "./StreamTransport";
import type { NativeToolCall, ToolExecutor } from "./ToolExecutor";
import { broadcaster } from "./WebSocketBroadcaster";

/**
 * 流处理器 - 负责处理 LLM 流式响应
 */
export class StreamHandler {
  private consecutiveErrorCount = 0;
  private readonly transport = new StreamTransport();
  private static readonly PARALLEL_SAFE_TOOL_NAMES = new Set([
    "listFiles",
    "readFile",
    "readRules",
    "browserSearch",
    "goToDefinition",
    "findReferences",
    "getDiagnostics",
    "readDesignSession",
    "readLayoutOptions",
    "readThemeOptions",
    "readFinalDesignDraft",
    "readModuleDrafts",
    "readDraftCritique",
    "readRepoKnowledge",
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
    ephemeralMessages: ChatMessage[] = [],
  ): Promise<{ currentTool: string; toolCalls: ResolvedToolCall[] }> {
    if (conversation.isAborted) {
      logger.info("检测到中断状态，停止 handleStream");
      throw new Error("interrupt");
    }

    try {
      let debugSession: ReturnType<typeof createModelContextDebugSession> | undefined;
      const preparedMessages = await contextCompressionManager.prepareMessages(
        conversation,
        abortController.signal,
        ephemeralMessages,
      );
      const toolDefinitions = conversation.toolService.getToolDefinitions({
        currentPhase: conversation.currentWorkflowPhase,
        agentRole: conversation.workflowAgentRole,
      });
      debugSession = createModelContextDebugSession({
        conversationId: conversation.id,
        conversationType: conversation.parentId ? "sub" : "main",
        llm: conversation.llm,
        messages: preparedMessages,
        options: {
          signal: abortController.signal,
          tools: toolDefinitions,
        },
        workflowPhase: conversation.currentWorkflowPhase,
        agentRole: conversation.workflowAgentRole,
      });
      const stream = await conversation.llm.stream(preparedMessages, {
        signal: abortController.signal,
        tools: toolDefinitions,
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
          return { currentTool: "interrupt", toolCalls: [] };
        }

        if (event.type === "reasoning_delta") {
          if (toolCallStarted) {
            continue;
          }
          if (!event.text) {
            continue;
          }
          debugSession.observeReasoning(reasoningBuffer + event.text);
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
          debugSession.observeAssistant(messageBuffer + event.text);
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
          debugSession.logToolCall("tool_call_delta", {
            toolName: event.name,
            toolCallId: event.toolCallId,
            partialArguments,
          });
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
        debugSession.logToolCall("tool_call_done", {
          toolName: event.name,
          toolCallId: event.toolCallId,
          arguments: event.arguments || {},
        });
      }

      if (completedToolCalls.length > 0) {
        currentTool = completedToolCalls[completedToolCalls.length - 1]?.toolName || currentTool;
      }

      if (!reasoningFinalized) {
        this.transport.emitFinalThink(conversation, reasoningBuffer, reasoningUpdateTime);
      }
      if (!toolCallStarted) {
        this.transport.emitFinalMessage(conversation, messageBuffer);
      }
      contextCompressionManager.syncContextUsage(conversation);
      debugSession.observeReasoning(reasoningBuffer, true);
      debugSession.observeAssistant(messageBuffer, true);
      debugSession.finish("completed");

      this.consecutiveErrorCount = 0;
      return {
        currentTool: currentTool || "message",
        toolCalls: completedToolCalls,
      };
    } catch (error: unknown) {
      const err = error as Error & { name?: string };
      if (
        err.name === "AbortError" ||
        conversation.isAborted ||
        err.message === "interrupt" ||
        abortController.signal.aborted
      ) {
        logger.info("流式响应被用户中断");
        return { currentTool: "interrupt", toolCalls: [] };
      }

      await this.handleError(conversation, err);
      return { currentTool: "interrupt", toolCalls: [] };
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

    for (let index = 0; index < toolCalls.length; ) {
      const toolCall = toolCalls[index];
      if (!toolCall) {
        index += 1;
        continue;
      }

      currentTool = toolCall.toolName;

      if (!this.shouldAutoApprove(conversation, toolCall.toolName)) {
        this.pauseForToolConfirmation(conversation, toolCall, toolCalls.slice(index + 1));
        return currentTool;
      }

      const parallelBatch = this.collectParallelSafeBatch(conversation, toolCalls, index);
      if (parallelBatch.length > 1) {
        conversation.status = "tool_executing";
        await Promise.all(
          parallelBatch.map((batchToolCall) =>
            this.toolExecutor.executeToolCall(
              conversation,
              {
                toolCallId: batchToolCall.toolCallId,
                name: batchToolCall.toolName,
                arguments:
                  batchToolCall.params &&
                  typeof batchToolCall.params === "object" &&
                  !Array.isArray(batchToolCall.params)
                    ? (batchToolCall.params as Record<string, unknown>)
                    : {},
              } satisfies NativeToolCall,
              batchToolCall.type,
              abortSignal,
              batchToolCall.updateTime,
            ),
          ),
        );

        currentTool = parallelBatch[parallelBatch.length - 1]?.toolName || currentTool;
        index += parallelBatch.length;

        if (conversation.isAborted || abortSignal?.aborted) {
          break;
        }
        continue;
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

      index += 1;
    }

    return currentTool;
  }

  private collectParallelSafeBatch(
    conversation: Conversation,
    toolCalls: ResolvedToolCall[],
    startIndex: number,
  ): ResolvedToolCall[] {
    const batch: ResolvedToolCall[] = [];

    for (let index = startIndex; index < toolCalls.length; index += 1) {
      const toolCall = toolCalls[index];
      if (!toolCall) {
        break;
      }

      if (!this.shouldAutoApprove(conversation, toolCall.toolName)) {
        break;
      }

      if (!this.isParallelSafeTool(conversation, toolCall.toolName)) {
        break;
      }

      batch.push(toolCall);
    }

    return batch;
  }

  private isParallelSafeTool(conversation: Conversation, toolName: string): boolean {
    const tool = conversation.toolService?.getToolFromName?.(toolName, {
      currentPhase: conversation.currentWorkflowPhase,
      agentRole: conversation.workflowAgentRole,
    });

    if (tool?.completionBehavior === "idle") {
      return false;
    }

    if (tool?.executionMode === "parallel_readonly") {
      return true;
    }

    return StreamHandler.PARALLEL_SAFE_TOOL_NAMES.has(toolName);
  }

  private shouldAutoApprove(conversation: Conversation, toolName: string): boolean {
    if (
      conversation.workflowAgentRole === "execution_worker" ||
      conversation.workflowAgentRole === "verification_reviewer"
    ) {
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

import type { ChatMessage, SERVER_SEND_MESSAGE_NAME, WebSocketMessage } from "@amigo-llm/types";
import type { ToolExecutionContext } from "@amigo-llm/types/src/tool";
import type { Sandbox } from "@/core/sandbox";
import { getGlobalState } from "@/globalState";
import { logger } from "@/utils/logger";
import { getSandboxManager } from "../../sandbox";
import { buildEditFilePreview } from "../../tools/editFile";
import type { Conversation } from "../Conversation";
import {
  announceConversationCheckpoint,
  normalizeCheckpointPayload,
} from "../context/conversationCheckpoint";
import { summarizeToolResultStatusForMemory } from "../context/toolResultSerialization";
import {
  buildAssistantToolCallMemoryMessage,
  buildToolResultMemoryMessage,
} from "../context/toolTranscript";
import { broadcaster } from "./WebSocketBroadcaster";

interface ToolContent {
  toolName: string;
  params: unknown;
  toolCallId?: string;
  result?: unknown;
  error?: string;
  websocketData?: unknown;
}

interface ToolError {
  toolName: string;
  error: string;
  type: ChatMessage["type"];
}

export interface NativeToolCall {
  toolCallId?: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * 工具执行器 - 负责工具调用的执行和结果处理
 */
export class ToolExecutor {
  private lastToolHadError = false;
  private lastToolError: ToolError | null = null;
  private toolCallUpdateTimes = new Map<string, number>();

  private persistToolTranscriptToMemory(params: {
    conversation: Conversation;
    toolName: string;
    toolCallId?: string;
    arguments: unknown;
    result?: unknown;
    summary?: string;
    error?: string;
    isError?: boolean;
    updateTime: number;
  }): void {
    const {
      conversation,
      toolName,
      toolCallId,
      arguments: toolArguments,
      result,
      summary,
      error,
      isError,
      updateTime,
    } = params;

    conversation.memory.addMessage(
      buildAssistantToolCallMemoryMessage({
        toolName,
        toolCallId,
        arguments:
          toolArguments && typeof toolArguments === "object" && !Array.isArray(toolArguments)
            ? (toolArguments as Record<string, unknown>)
            : {},
        updateTime,
      }),
    );

    conversation.memory.addMessage(
      buildToolResultMemoryMessage({
        toolName,
        toolCallId,
        ...(result !== undefined ? { result } : {}),
        ...(typeof summary === "string" && summary.trim() ? { summary: summary.trim() } : {}),
        ...(typeof error === "string" && error.trim() ? { error: error.trim() } : {}),
        ...(isError ? { isError: true } : {}),
        updateTime,
      }),
    );
  }

  private emitToolTransportMessage(
    conversation: Conversation,
    type: ChatMessage["type"],
    payload: string,
    partial: boolean,
    updateTime?: number,
  ): void {
    const wsMessage: WebSocketMessage<SERVER_SEND_MESSAGE_NAME> = {
      type: type as SERVER_SEND_MESSAGE_NAME,
      data: {
        message: payload,
        partial,
        updateTime: updateTime ?? Date.now(),
        taskId: conversation.id,
      },
    };

    broadcaster.broadcast(conversation.id, wsMessage);
    conversation.memory.addWebsocketMessage(wsMessage);

    if (!partial) {
      const onConversationMessage = getGlobalState("onConversationMessage");
      const memoryRuntime = getGlobalState("memoryRuntime");
      const message = {
        role: "assistant" as const,
        content: payload,
        type,
        partial,
        updateTime: wsMessage.data.updateTime,
      };
      if (onConversationMessage) {
        void Promise.resolve(
          onConversationMessage({
            taskId: conversation.id,
            message,
            context: conversation.memory.context,
          }),
        ).catch((error) => {
          logger.error(
            `[ToolExecutor] onConversationMessage hook 失败 taskId=${conversation.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      }
      if (memoryRuntime) {
        void memoryRuntime.handleAssistantMessage({
          taskId: conversation.id,
          message,
          context: conversation.memory.context,
        });
      }
    }
  }

  private getToolCallKey(conversationId: string, toolName: string, toolCallId?: string): string {
    return `${conversationId}:${toolName}:${toolCallId || "no-call-id"}`;
  }

  /**
   * 获取最后一个工具是否有错误
   */
  getLastToolHadError(): boolean {
    return this.lastToolHadError;
  }

  /**
   * 获取最后一个工具的错误详情
   */
  getLastToolError(): ToolError | null {
    return this.lastToolError;
  }

  /**
   * 重置工具错误状态
   */
  resetToolError(): void {
    this.lastToolHadError = false;
    this.lastToolError = null;
  }

  /**
   * 执行工具调用
   */
  async executeToolCall(
    conversation: Conversation,
    toolCall: NativeToolCall,
    type: ChatMessage["type"],
    abortSignal?: AbortSignal,
    updateTime?: number,
  ): Promise<void> {
    const toolName = toolCall.name;
    const sandboxManager = getSandboxManager();
    const toolCallKey = this.getToolCallKey(conversation.id, toolName, toolCall.toolCallId);
    const callUpdateTime = updateTime ?? Date.now();
    this.toolCallUpdateTimes.set(toolCallKey, callUpdateTime);

    if (conversation.isAborted || conversation.status === "aborted" || abortSignal?.aborted) {
      logger.info(`[ToolExecutor] 会话已中断，跳过工具调用: ${toolName}`);
      return;
    }

    let partialWebsocketData: unknown;
    if (toolName === "editFile") {
      try {
        const sandbox = sandboxManager.get(conversation.parentId || conversation.id);
        if (sandbox?.isRunning()) {
          partialWebsocketData = (
            await buildEditFilePreview(
              sandbox as Sandbox,
              toolCall.arguments as Parameters<typeof buildEditFilePreview>[1],
            )
          ).websocketData;
        }
      } catch (error) {
        logger.debug("[ToolExecutor] 构建 editFile partial diff 失败（可忽略）:", error);
      }
    }

    // 发送 partial 消息，展示待执行参数
    this.emitToolTransportMessage(
      conversation,
      type,
      JSON.stringify({
        params: toolCall.arguments,
        result: undefined,
        websocketData: partialWebsocketData,
        toolName,
        toolCallId: toolCall.toolCallId,
      } satisfies ToolContent),
      true,
      callUpdateTime,
    );

    // 执行工具
    const {
      toolResult,
      continuationResult,
      continuationSummary,
      checkpointResult,
      params,
      websocketData,
      error,
    } = await conversation.toolService.executeToolCall({
      toolName,
      params: toolCall.arguments,
      context: this.createExecutionContext(conversation, abortSignal),
    });
    const abortedAfterToolReturned = conversation.isAborted || abortSignal?.aborted;

    if (error) {
      logger.error(`[ToolExecutor] 工具调用错误: ${error}`);
      this.lastToolHadError = true;
      this.lastToolError = { toolName, error, type };

      // 工具执行报错后，这次 tool call 已经结束。
      // 这里必须发 non-partial 终态消息，否则会被 partial 节流吞掉，前端会一直停留在 loading。
      this.emitToolTransportMessage(
        conversation,
        type,
        JSON.stringify({
          result: toolResult,
          params,
          toolName,
          toolCallId: toolCall.toolCallId,
          error,
          websocketData,
        } satisfies ToolContent),
        false,
        this.toolCallUpdateTimes.get(toolCallKey) ?? callUpdateTime,
      );

      this.persistToolTranscriptToMemory({
        conversation,
        toolName,
        toolCallId: toolCall.toolCallId,
        arguments: params,
        result: continuationResult ?? toolResult,
        summary:
          continuationSummary ||
          summarizeToolResultStatusForMemory(toolName, continuationResult ?? toolResult) ||
          undefined,
        error,
        isError: true,
        updateTime: this.toolCallUpdateTimes.get(toolCallKey) ?? callUpdateTime,
      });

      this.toolCallUpdateTimes.delete(toolCallKey);

      logger.info(`[ToolExecutor] 工具错误已记录，将在 CompletionHandler 中添加到 memory`);
      if (abortedAfterToolReturned) {
        logger.info(`[ToolExecutor] 工具结果已记录，但会话已中断，不再继续: ${toolName}`);
      }
    } else {
      this.handleToolSuccess(
        conversation,
        toolName,
        params,
        toolCall.toolCallId,
        toolResult,
        continuationResult ?? toolResult,
        continuationSummary,
        checkpointResult,
        websocketData,
        type,
        this.toolCallUpdateTimes.get(toolCallKey) ?? callUpdateTime,
      );
      this.toolCallUpdateTimes.delete(toolCallKey);

      if (abortedAfterToolReturned) {
        logger.info(`[ToolExecutor] 工具结果已记录，但会话已中断，不再继续: ${toolName}`);
      }
    }
  }

  /**
   * 处理工具执行成功
   */
  private handleToolSuccess(
    conversation: Conversation,
    toolName: string,
    params: unknown,
    toolCallId: string | undefined,
    transportResult: unknown,
    continuationResult: unknown,
    continuationSummary: string | undefined,
    checkpointResult: unknown,
    websocketData: unknown,
    type: ChatMessage["type"],
    updateTime: number,
  ): void {
    const toolPayload = {
      result: transportResult,
      params,
      toolName,
      toolCallId,
      websocketData,
    } satisfies ToolContent;

    this.emitToolTransportMessage(
      conversation,
      type,
      JSON.stringify(toolPayload),
      false,
      updateTime,
    );

    this.persistToolTranscriptToMemory({
      conversation,
      toolName,
      toolCallId,
      arguments: params,
      result: continuationResult,
      summary:
        continuationSummary ||
        summarizeToolResultStatusForMemory(toolName, continuationResult) ||
        undefined,
      updateTime,
    });
    const checkpointPayload = normalizeCheckpointPayload(checkpointResult);
    if (checkpointPayload) {
      announceConversationCheckpoint({
        memory: conversation.memory,
        payload: checkpointPayload,
      });
    }
  }

  private createExecutionContext(
    conversation: Conversation,
    abortSignal?: AbortSignal,
  ): ToolExecutionContext {
    const sandboxManager = getSandboxManager();
    const languageRuntimeHostManager = getGlobalState("languageRuntimeHostManager");
    return {
      taskId: conversation.id,
      parentId: conversation.parentId,
      conversationContext: conversation.memory.context,
      workflowState: conversation.workflowState,
      currentPhase: conversation.currentWorkflowPhase,
      agentRole: conversation.workflowAgentRole,
      workflowMode: conversation.workflowState?.mode,
      getSandbox: () => sandboxManager.getOrCreate(conversation.parentId || conversation.id),
      getLanguageRuntimeHost: languageRuntimeHostManager
        ? () =>
            languageRuntimeHostManager.getOrCreate(
              conversation.parentId || conversation.id,
              conversation.memory.context,
            )
        : undefined,
      getToolByName: (name: string) =>
        conversation.toolService.getToolFromName(name, {
          currentPhase: conversation.currentWorkflowPhase,
          agentRole: conversation.workflowAgentRole,
          workflowMode: conversation.workflowState?.mode,
        }),
      signal: abortSignal,
      postMessage: (msg: string | object) => {
        broadcaster.postMessage(conversation, {
          role: "assistant",
          content: typeof msg === "string" ? msg : JSON.stringify(msg),
          type: "message",
          partial: true,
        });
      },
    };
  }
}

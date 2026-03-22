import type { ChatMessage, SERVER_SEND_MESSAGE_NAME, WebSocketMessage } from "@amigo-llm/types";
import type { ToolExecutionContext } from "@amigo-llm/types/src/tool";
import type { Sandbox } from "@/core/sandbox";
import { getGlobalState } from "@/globalState";
import { logger } from "@/utils/logger";
import { getSandboxManager } from "../sandbox";
import { buildEditFilePreview } from "../tools/editFile";
import type { Conversation } from "./Conversation";
import {
  buildAssistantMemoryToolContent,
  serializeToolResultForMemory,
} from "./toolResultSerialization";
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

  private shouldPersistToolPayloadToMemory(conversation: Conversation, toolName: string): boolean {
    // Most tool payload JSON should not enter model memory to avoid pattern pollution.
    // Keep completeTask payload in sub-tasks for robust result extraction.
    return conversation.type === "sub" && toolName === "completeTask";
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
      if (onConversationMessage) {
        void Promise.resolve(
          onConversationMessage({
            taskId: conversation.id,
            message: {
              role: "assistant",
              content: payload,
              type,
              partial,
              updateTime: wsMessage.data.updateTime,
            },
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
    const { toolResult, message, params, websocketData, error } =
      await conversation.toolService.executeToolCall({
        toolName,
        params: toolCall.arguments,
        context: this.createExecutionContext(conversation, abortSignal),
      });
    if (conversation.isAborted || abortSignal?.aborted) {
      logger.info(`[ToolExecutor] 工具返回后检测到中断，丢弃结果: ${toolName}`);
      return;
    }

    if (error) {
      logger.error(`[ToolExecutor] 工具调用错误: ${error}`);
      this.lastToolHadError = true;
      this.lastToolError = { toolName, error, type };

      // 发送错误的 WebSocket 消息（使用 partial: true 表示这不是最终状态）
      this.emitToolTransportMessage(
        conversation,
        type,
        JSON.stringify({
          result: "",
          params,
          toolName,
          toolCallId: toolCall.toolCallId,
          error,
          websocketData,
        } satisfies ToolContent),
        true,
        this.toolCallUpdateTimes.get(toolCallKey) ?? callUpdateTime,
      );
      this.toolCallUpdateTimes.delete(toolCallKey);

      logger.info(`[ToolExecutor] 工具错误已记录，将在 CompletionHandler 中添加到 memory`);
    } else {
      this.handleToolSuccess(
        conversation,
        toolName,
        params,
        toolCall.toolCallId,
        toolResult,
        websocketData,
        message,
        type,
        this.toolCallUpdateTimes.get(toolCallKey) ?? callUpdateTime,
      );
      this.toolCallUpdateTimes.delete(toolCallKey);
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
    result: unknown,
    websocketData: unknown,
    message: string,
    type: ChatMessage["type"],
    updateTime: number,
  ): void {
    const toolPayload = {
      result,
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

    if (this.shouldPersistToolPayloadToMemory(conversation, toolName)) {
      broadcaster.persistMessageOnly(conversation, {
        role: "assistant",
        content: buildAssistantMemoryToolContent(toolName, params, toolCallId, result),
        type,
        partial: false,
      });
    }

    const serializedResult = serializeToolResultForMemory(toolName, result);
    conversation.memory.addMessage({
      role: "system",
      content:
        `当前工具调用：${toolName}，\n` +
        `工具执行结果（result）：\n${serializedResult}\n\n` +
        `工具执行信息（message）：\n${message}\n`,
      type,
      partial: false,
    });
  }

  private createExecutionContext(
    conversation: Conversation,
    abortSignal?: AbortSignal,
  ): ToolExecutionContext {
    const sandboxManager = getSandboxManager();
    return {
      taskId: conversation.id,
      parentId: conversation.parentId,
      getSandbox: () => sandboxManager.getOrCreate(conversation.parentId || conversation.id),
      getToolByName: (name: string) => conversation.toolService.getToolFromName(name),
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

import type { ChatMessage } from "@amigo-llm/types";
import type { ToolExecutionContext } from "@amigo-llm/types/src/tool";
import { logger } from "@/utils/logger";
import { sandboxRegistry } from "../sandbox";
import type { Conversation } from "./Conversation";
import { broadcaster } from "./WebSocketBroadcaster";

interface ToolContent {
  toolName: string;
  params: unknown;
  result?: unknown;
  error?: string;
}

interface ToolError {
  toolName: string;
  error: string;
  type: ChatMessage["type"];
}

/**
 * 工具执行器 - 负责工具调用的执行和结果处理
 */
export class ToolExecutor {
  private lastToolHadError = false;
  private lastToolError: ToolError | null = null;

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
    fullToolCall: string,
    toolName: string,
    type: ChatMessage["type"],
    abortSignal?: AbortSignal,
  ): Promise<void> {
    // 发送 partial 消息 - 使用 partial: true 避免参数验证错误
    const { params: partialParams } = conversation.toolService.parseParams(fullToolCall, true);
    broadcaster.postMessage(conversation, {
      role: "assistant",
      content: JSON.stringify({
        params: partialParams,
        toolName,
      } satisfies ToolContent),
      originalMessage: fullToolCall,
      type,
      partial: true,
    });

    // 构建执行上下文
    const context: ToolExecutionContext = {
      taskId: conversation.id,
      parentId: conversation.parentId,
      getSandbox: () => sandboxRegistry.getOrCreate(conversation.parentId || conversation.id),
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

    // 执行工具
    const { toolResult, message, params, error } = await conversation.toolService.parseAndExecute({
      xmlParams: fullToolCall,
      context,
    });

    if (error) {
      logger.error(`[ToolExecutor] 工具调用错误: ${error}`);
      this.lastToolHadError = true;
      this.lastToolError = { toolName, error, type };

      // 发送错误的 WebSocket 消息（使用 partial: true 表示这不是最终状态）
      broadcaster.postMessage(conversation, {
        role: "assistant",
        content: JSON.stringify({
          result: "",
          params,
          toolName,
          error,
        } satisfies ToolContent),
        originalMessage: fullToolCall,
        type,
        partial: true,
      });

      logger.info(`[ToolExecutor] 工具错误已记录，将在 CompletionHandler 中添加到 memory`);
    } else {
      this.handleToolSuccess(
        conversation,
        toolName,
        params,
        toolResult,
        message,
        fullToolCall,
        type,
      );
    }
  }

  /**
   * 处理工具执行成功
   */
  private handleToolSuccess(
    conversation: Conversation,
    toolName: string,
    params: unknown,
    result: unknown,
    message: string,
    originalMessage: string,
    type: ChatMessage["type"],
  ): void {
    broadcaster.postMessage(conversation, {
      role: "assistant",
      content: JSON.stringify({
        result,
        params,
        toolName,
      } satisfies ToolContent),
      originalMessage,
      type,
      partial: false,
    });

    conversation.memory.addMessage({
      role: "system",
      content: `当前工具调用：${toolName}，\n工具执行信息：\n${message}\n`,
      type,
      partial: false,
    });
  }

  /**
   * 处理 partial 工具调用
   */
  handlePartialToolCall(
    conversation: Conversation,
    partialToolCall: string,
    toolName: string,
    type: ChatMessage["type"],
  ): void {
    const { params } = conversation.toolService.parseParams(partialToolCall, true);
    broadcaster.postMessage(conversation, {
      role: "assistant",
      content: JSON.stringify({
        params,
        result: "",
        toolName,
      } satisfies ToolContent),
      originalMessage: partialToolCall,
      type,
      partial: true,
    });
  }
}

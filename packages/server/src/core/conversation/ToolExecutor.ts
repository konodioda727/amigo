import type { ChatMessage } from "@amigo-llm/types";
import type { ToolExecutionContext } from "@amigo-llm/types/src/tool";
import { logger } from "@/utils/logger";
import { sandboxRegistry } from "../sandbox";
import type { Conversation } from "./Conversation";
import { broadcaster } from "./WebSocketBroadcaster";

interface ToolContent {
  toolName: string;
  params: unknown;
  toolCallId?: string;
  result?: unknown;
  error?: string;
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

  private static readonly BROWSER_SEARCH_RESULT_PREVIEW_COUNT = 8;
  private static readonly BROWSER_SEARCH_CONTENT_PREVIEW_LENGTH = 1200;

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private compactBrowserSearchResult(result: unknown): unknown {
    const record = this.asRecord(result);
    if (!record) {
      return result;
    }

    const rawResults = Array.isArray(record.results) ? record.results : [];
    const compactResults = rawResults
      .slice(0, ToolExecutor.BROWSER_SEARCH_RESULT_PREVIEW_COUNT)
      .map((item) => {
        const row = this.asRecord(item);
        if (!row) {
          return item;
        }

        const compactRow: Record<string, unknown> = {};
        if (typeof row.title === "string") {
          compactRow.title = row.title;
        }
        if (typeof row.url === "string") {
          compactRow.url = row.url;
        }
        if (typeof row.snippet === "string") {
          compactRow.snippet = row.snippet;
        }
        if (typeof row.error === "string" && row.error) {
          compactRow.error = row.error;
        }

        if (typeof row.content === "string" && row.content) {
          const content = row.content;
          compactRow.contentPreview =
            content.length > ToolExecutor.BROWSER_SEARCH_CONTENT_PREVIEW_LENGTH
              ? `${content.slice(0, ToolExecutor.BROWSER_SEARCH_CONTENT_PREVIEW_LENGTH)}...`
              : content;
          compactRow.contentLength = content.length;
        }

        return compactRow;
      });

    const failureCount = rawResults.filter((item) => {
      const row = this.asRecord(item);
      return !!(row && typeof row.error === "string" && row.error);
    }).length;
    const successCount = rawResults.length - failureCount;

    return {
      content: typeof record.content === "string" ? record.content : "",
      title: typeof record.title === "string" ? record.title : "",
      url: typeof record.url === "string" ? record.url : "",
      totalResults: rawResults.length,
      successCount,
      failureCount,
      results: compactResults,
      omittedResults: Math.max(
        0,
        rawResults.length - ToolExecutor.BROWSER_SEARCH_RESULT_PREVIEW_COUNT,
      ),
    };
  }

  private normalizeResultForMemory(toolName: string, result: unknown): unknown {
    if (toolName === "browserSearch") {
      return this.compactBrowserSearchResult(result);
    }
    return result;
  }

  private buildAssistantMemoryToolContent(
    toolName: string,
    params: unknown,
    toolCallId: string | undefined,
    result: unknown,
  ): string {
    if (toolName !== "browserSearch") {
      return JSON.stringify({
        result,
        params,
        toolName,
        toolCallId,
      } satisfies ToolContent);
    }

    const compactResult = this.compactBrowserSearchResult(result);
    const compactRecord = this.asRecord(compactResult) || {};
    const summary = {
      content: typeof compactRecord.content === "string" ? compactRecord.content : "",
      totalResults:
        typeof compactRecord.totalResults === "number" ? compactRecord.totalResults : undefined,
      successCount:
        typeof compactRecord.successCount === "number" ? compactRecord.successCount : undefined,
      failureCount:
        typeof compactRecord.failureCount === "number" ? compactRecord.failureCount : undefined,
    };

    return JSON.stringify({
      result: summary,
      params,
      toolName,
      toolCallId,
    } satisfies ToolContent);
  }

  private serializeResultForMemory(toolName: string, result: unknown): string {
    try {
      const normalized = this.normalizeResultForMemory(toolName, result);
      const serialized = JSON.stringify(normalized, null, 2);
      const maxLength = toolName === "browserSearch" ? 60_000 : 20_000;
      if (serialized.length <= maxLength) {
        return serialized;
      }
      return `${serialized.slice(0, maxLength)}\n...（已截断，共 ${serialized.length} 字符）`;
    } catch (error) {
      const fallback = String(result);
      logger.warn("[ToolExecutor] 序列化工具结果失败，将使用字符串兜底:", error);
      return fallback;
    }
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
  ): Promise<void> {
    const toolName = toolCall.name;

    if (conversation.isAborted || conversation.status === "aborted" || abortSignal?.aborted) {
      logger.info(`[ToolExecutor] 会话已中断，跳过工具调用: ${toolName}`);
      return;
    }

    // 发送 partial 消息，展示待执行参数
    broadcaster.postMessage(conversation, {
      role: "assistant",
      content: JSON.stringify({
        params: toolCall.arguments,
        toolName,
        toolCallId: toolCall.toolCallId,
      } satisfies ToolContent),
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
    const { toolResult, message, params, error } = await conversation.toolService.executeToolCall({
      toolName,
      params: toolCall.arguments,
      context,
    });
    if (conversation.isAborted || conversation.status === "aborted" || abortSignal?.aborted) {
      logger.info(`[ToolExecutor] 工具返回后检测到中断，丢弃结果: ${toolName}`);
      return;
    }

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
          toolCallId: toolCall.toolCallId,
          error,
        } satisfies ToolContent),
        type,
        partial: true,
      });

      logger.info(`[ToolExecutor] 工具错误已记录，将在 CompletionHandler 中添加到 memory`);
    } else {
      this.handleToolSuccess(
        conversation,
        toolName,
        params,
        toolCall.toolCallId,
        toolResult,
        message,
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
    toolCallId: string | undefined,
    result: unknown,
    message: string,
    type: ChatMessage["type"],
  ): void {
    const toolPayload = {
      result,
      params,
      toolName,
      toolCallId,
    } satisfies ToolContent;

    broadcaster.postMessage(conversation, {
      role: "assistant",
      content: JSON.stringify(toolPayload),
      // 对 browserSearch，在 memory 中只保留精简摘要，避免与 system 工具结果重复。
      originalMessage: this.buildAssistantMemoryToolContent(toolName, params, toolCallId, result),
      type,
      partial: false,
    });

    const serializedResult = this.serializeResultForMemory(toolName, result);
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
}

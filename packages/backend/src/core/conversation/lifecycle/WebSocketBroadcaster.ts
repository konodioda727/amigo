import type { ChatMessage, SERVER_SEND_MESSAGE_NAME, WebSocketMessage } from "@amigo-llm/types";
import type { ServerWebSocket } from "bun";
import { getGlobalState } from "@/globalState";
import { isWhitespaceOnly } from "@/utils/isWhiteSpaceOnly";
import { logger } from "@/utils/logger";
import type { Conversation } from "../Conversation";

/**
 * WebSocket 广播器 - 管理连接和消息广播
 * 职责单一：只负责 WebSocket 连接管理和消息发送
 */
export class WebSocketBroadcaster {
  private connections = new Map<string, ServerWebSocket[]>();
  private partialBroadcastAt = new Map<string, number>();
  private static readonly PARTIAL_BROADCAST_THROTTLE_MS = 250;

  private withConversationTaskId<T extends SERVER_SEND_MESSAGE_NAME>(
    conversation: Conversation,
    message: WebSocketMessage<T>,
  ): WebSocketMessage<T> {
    return {
      ...message,
      data: {
        ...message.data,
        taskId:
          (message.data as Record<string, unknown>).taskId === undefined
            ? conversation.id
            : (message.data as Record<string, unknown>).taskId,
      } as WebSocketMessage<T>["data"],
    };
  }

  /**
   * 添加连接
   */
  addConnection(conversationId: string, ws: ServerWebSocket): void {
    const conns = this.connections.get(conversationId) || [];
    if (!conns.includes(ws)) {
      conns.push(ws);
      this.connections.set(conversationId, conns);
    }
  }

  /**
   * 移除连接
   */
  removeConnection(conversationId: string, ws: ServerWebSocket): void {
    const conns = this.connections.get(conversationId);
    if (conns) {
      const index = conns.indexOf(ws);
      if (index !== -1) {
        conns.splice(index, 1);
      }
      if (conns.length === 0) {
        this.connections.delete(conversationId);
        this.clearPartialBroadcastStateForConversation(conversationId);
      }
    }
  }

  /**
   * 获取会话的所有连接
   */
  getConnections(conversationId: string): ServerWebSocket[] {
    return this.connections.get(conversationId) || [];
  }

  /**
   * 检查连接是否存在
   */
  hasConnection(conversationId: string, ws: ServerWebSocket): boolean {
    const conns = this.connections.get(conversationId);
    return conns ? conns.includes(ws) : false;
  }

  /**
   * 获取连接数量
   */
  getConnectionCount(conversationId: string): number {
    return this.connections.get(conversationId)?.length || 0;
  }

  /**
   * 根据 WebSocket 查找对应的会话 ID
   */
  findConversationIdByWs(ws: ServerWebSocket): string | undefined {
    for (const [conversationId, conns] of this.connections) {
      if (conns.includes(ws)) {
        return conversationId;
      }
    }
    return undefined;
  }

  /**
   * 广播消息到指定会话的所有连接
   */
  broadcast<T extends SERVER_SEND_MESSAGE_NAME>(
    conversationId: string,
    message: WebSocketMessage<T>,
  ): void {
    if (this.shouldSkipPartialBroadcast(conversationId, message)) {
      return;
    }

    const conns = this.connections.get(conversationId) || [];
    const payload = JSON.stringify({
      type: message.type,
      data: {
        ...message.data,
        updateTime: (message.data as Record<string, unknown>).updateTime || Date.now(),
      },
    });

    for (const ws of conns) {
      ws.send(payload);
    }
  }

  broadcastConversation<T extends SERVER_SEND_MESSAGE_NAME>(
    conversation: Conversation,
    message: WebSocketMessage<T>,
  ): void {
    this.broadcast(conversation.id, this.withConversationTaskId(conversation, message));
  }

  /**
   * 发送消息并同时保存到模型 memory / websocket 历史
   */
  postMessage(conversation: Conversation, message: ChatMessage): void {
    // 避免空白消息或已中断时发送
    if (isWhitespaceOnly(message.content) || conversation.isAborted) {
      return;
    }

    // 保存到 memory
    conversation.memory.addMessage(message);

    const lastMessage = conversation.memory.lastMessage!;
    const onConversationMessage = getGlobalState("onConversationMessage");
    const memoryRuntime = getGlobalState("memoryRuntime");
    if (onConversationMessage) {
      void Promise.resolve(
        onConversationMessage({
          taskId: conversation.id,
          message: lastMessage,
          context: conversation.memory.context,
        }),
      ).catch((error) => {
        logger.error(
          `[WebSocketBroadcaster] onConversationMessage hook 失败 taskId=${conversation.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }
    if (memoryRuntime) {
      void memoryRuntime.handleAssistantMessage({
        taskId: conversation.id,
        message: lastMessage,
        context: conversation.memory.context,
      });
    }

    const wsMessage: WebSocketMessage<SERVER_SEND_MESSAGE_NAME> = {
      type: message.type as SERVER_SEND_MESSAGE_NAME,
      data: {
        message: message.content,
        partial: message.partial || false,
        updateTime: lastMessage.updateTime,
        taskId: conversation.id,
      },
    };

    this.broadcast(conversation.id, wsMessage);
    conversation.memory.addWebsocketMessage(wsMessage);
  }

  /**
   * 仅保存到模型 memory，不向前端广播
   */
  persistMessageOnly(conversation: Conversation, message: ChatMessage): void {
    if (isWhitespaceOnly(message.content)) {
      return;
    }

    conversation.memory.addMessage(message);
    const lastMessage = conversation.memory.lastMessage;
    const memoryRuntime = getGlobalState("memoryRuntime");
    if (lastMessage && memoryRuntime) {
      void memoryRuntime.handleAssistantMessage({
        taskId: conversation.id,
        message: lastMessage,
        context: conversation.memory.context,
      });
    }
  }

  /**
   * 发送消息并保存到 websocket 历史（不保存到 ChatMessage memory）
   */
  emitAndSave<T extends SERVER_SEND_MESSAGE_NAME>(
    conversation: Conversation,
    message: WebSocketMessage<T>,
  ): void {
    const scopedMessage = this.withConversationTaskId(conversation, message);
    this.broadcast(conversation.id, scopedMessage);
    conversation.memory.addWebsocketMessage(scopedMessage as WebSocketMessage<T>);
  }

  private getPartialBroadcastKey<T extends SERVER_SEND_MESSAGE_NAME>(
    conversationId: string,
    message: WebSocketMessage<T>,
  ): string | null {
    const data = message.data as Record<string, unknown>;
    if (data.partial !== true) {
      return null;
    }

    const updateTime = data.updateTime;
    if (typeof updateTime !== "number" || !Number.isFinite(updateTime)) {
      return null;
    }

    return `${conversationId}:${message.type}:${updateTime}`;
  }

  private shouldSkipPartialBroadcast<T extends SERVER_SEND_MESSAGE_NAME>(
    conversationId: string,
    message: WebSocketMessage<T>,
  ): boolean {
    const partialKey = this.getPartialBroadcastKey(conversationId, message);
    if (!partialKey) {
      this.clearMatchingPartialBroadcastKey(conversationId, message);
      return false;
    }

    const now = Date.now();
    const lastBroadcastAt = this.partialBroadcastAt.get(partialKey);
    if (
      typeof lastBroadcastAt === "number" &&
      now - lastBroadcastAt < WebSocketBroadcaster.PARTIAL_BROADCAST_THROTTLE_MS
    ) {
      return true;
    }

    this.partialBroadcastAt.set(partialKey, now);
    return false;
  }

  private clearMatchingPartialBroadcastKey<T extends SERVER_SEND_MESSAGE_NAME>(
    conversationId: string,
    message: WebSocketMessage<T>,
  ): void {
    const data = message.data as Record<string, unknown>;
    const updateTime = data.updateTime;
    if (typeof updateTime !== "number" || !Number.isFinite(updateTime)) {
      return;
    }

    this.partialBroadcastAt.delete(`${conversationId}:${message.type}:${updateTime}`);
  }

  private clearPartialBroadcastStateForConversation(conversationId: string): void {
    const prefix = `${conversationId}:`;
    for (const key of this.partialBroadcastAt.keys()) {
      if (key.startsWith(prefix)) {
        this.partialBroadcastAt.delete(key);
      }
    }
  }
}

// 全局单例
export const broadcaster = new WebSocketBroadcaster();

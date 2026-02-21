import type { ChatMessage, SERVER_SEND_MESSAGE_NAME, WebSocketMessage } from "@amigo-llm/types";
import type { ServerWebSocket } from "bun";
import { isWhitespaceOnly } from "@/utils/isWhiteSpaceOnly";
import type { Conversation } from "./Conversation";

/**
 * WebSocket 广播器 - 管理连接和消息广播
 * 职责单一：只负责 WebSocket 连接管理和消息发送
 */
export class WebSocketBroadcaster {
  private connections = new Map<string, ServerWebSocket[]>();

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

  /**
   * 发送消息并保存到 memory
   */
  postMessage(
    conversation: Conversation,
    message: ChatMessage & { originalMessage?: string },
  ): void {
    // 避免空白消息或已中断时发送
    if (
      (isWhitespaceOnly(message.originalMessage) && isWhitespaceOnly(message.content)) ||
      conversation.isAborted
    ) {
      return;
    }

    // 保存到 memory
    conversation.memory.addMessage({
      ...message,
      content: message.originalMessage || message.content,
    });

    const lastMessage = conversation.memory.lastMessage!;

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
   * 发送消息并保存到 websocket 历史（不保存到 ChatMessage memory）
   */
  emitAndSave<T extends SERVER_SEND_MESSAGE_NAME>(
    conversation: Conversation,
    message: WebSocketMessage<T>,
  ): void {
    this.broadcast(conversation.id, message);
    conversation.memory.addWebsocketMessage(message as WebSocketMessage<T>);
  }
}

// 全局单例
export const broadcaster = new WebSocketBroadcaster();

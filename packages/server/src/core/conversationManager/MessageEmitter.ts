import type { ChatMessage, SERVER_SEND_MESSAGE_NAME, WebSocketMessage } from "@amigo-llm/types";
import type { ServerWebSocket } from "bun";
import { isWhitespaceOnly } from "@/utils/isWhiteSpaceOnly";
import type { FilePersistedMemory } from "../memory";

interface MessageEmitterConfig {
  memory: FilePersistedMemory;
  getConnections: () => ServerWebSocket[];
  isAborted: () => boolean;
}

/**
 * 消息发送器 - 负责 WebSocket 消息的发送和持久化
 */
export class MessageEmitter {
  private memory: FilePersistedMemory;
  private getConnections: () => ServerWebSocket[];
  private isAborted: () => boolean;

  constructor(config: MessageEmitterConfig) {
    this.memory = config.memory;
    this.getConnections = config.getConnections;
    this.isAborted = config.isAborted;
  }

  /**
   * 发送消息给该 task 下所有 socket（不保存到 memory）
   */
  public emitMessage<T extends SERVER_SEND_MESSAGE_NAME>({
    type,
    data,
  }: WebSocketMessage<T>): void {
    const connections = this.getConnections();
    connections.forEach((ws) => {
      ws.send(
        JSON.stringify({
          type,
          data: { ...data, updateTime: (data as any).updateTime || Date.now() },
        } as WebSocketMessage<T>),
      );
    });
  }

  /**
   * 发送消息并保存到 websocket 历史（不保存到 ChatMessage memory）
   * 适用于 alert、conversationOver 等系统消息
   */
  public emitAndSaveMessage<T extends SERVER_SEND_MESSAGE_NAME>(
    message: WebSocketMessage<T>,
  ): void {
    this.emitMessage(message);
    this.memory.addWebsocketMessage(message as any);
  }

  /**
   * 发送消息并保存到 memory
   */
  public postMessage(message: ChatMessage & { originalMessage?: string }): void {
    // 1. 避免模型有时候输出空白字符
    // 2. 避免在 abort 后会发送残留信息
    if (
      (isWhitespaceOnly(message.originalMessage) && isWhitespaceOnly(message.content)) ||
      this.isAborted()
    ) {
      return;
    }

    this.memory.addMessage({ ...message, content: message.originalMessage || message.content });
    const lastMessage = this.memory.lastMessage!;

    const requestBody = {
      type: message.type as SERVER_SEND_MESSAGE_NAME,
      data: {
        message: message.content,
        partial: message.partial || false,
        updateTime: lastMessage.updateTime,
        taskId: this.memory.currentTaskId,
      },
    };

    this.emitMessage(requestBody);
    this.memory.addWebsocketMessage(requestBody);
  }
}

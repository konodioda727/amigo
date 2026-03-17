import type {
  ConversationStatus,
  USER_SEND_MESSAGE_NAME,
  WebSocketMessage,
} from "@amigo-llm/types";
import { UserSendMessageSchema, type UserSendWebSocketMessage } from "@amigo-llm/types";
import type { ServerWebSocket } from "bun";
import { v4 as uuidV4 } from "uuid";
import { broadcaster, conversationRepository } from "@/core/conversation";
import { getResolver } from "@/core/messageResolver";
import { getSessionHistories } from "@/utils/getSessions";
import { logger } from "@/utils/logger";
import type { MessageRegistry } from "../registry";

type SocketErrorCode =
  | "TASK_NOT_FOUND"
  | "INVALID_MESSAGE"
  | "UNSUPPORTED_MESSAGE_TYPE"
  | "CUSTOM_MESSAGE_VALIDATION_ERROR"
  | "CUSTOM_MESSAGE_HANDLER_MISSING"
  | "CUSTOM_MESSAGE_HANDLER_ERROR";

export class ServerWebSocketMessageHandler {
  constructor(private readonly messageRegistry?: MessageRegistry) {}

  async handleMessage(ws: ServerWebSocket, message: string): Promise<void> {
    try {
      const rawMessage = JSON.parse(message) as unknown;
      const builtInMessageParse = UserSendMessageSchema.safeParse(rawMessage);

      if (!builtInMessageParse.success) {
        const handledByCustomMessage = await this.tryHandleRegisteredMessage(ws, rawMessage);
        if (handledByCustomMessage) {
          return;
        }

        this.handleInvalidMessage(ws, rawMessage, builtInMessageParse.error.issues[0]);
        return;
      }

      const parsedMessage = builtInMessageParse.data as UserSendWebSocketMessage;
      const taskId = this.resolveTaskId(parsedMessage);

      if (parsedMessage.type === "loadTask") {
        await this.handleLoadTaskMessage(ws, taskId, parsedMessage);
        return;
      }

      const conversation = conversationRepository.getOrLoad(taskId);
      this.attachConnectionAndAck(ws, taskId, parsedMessage, conversation.status);

      const resolver = getResolver(parsedMessage.type as USER_SEND_MESSAGE_NAME, conversation);
      await resolver.process(parsedMessage.data);
    } catch (error) {
      logger.error("处理消息时出错:", error);
    }
  }

  async handleOpen(ws: ServerWebSocket): Promise<void> {
    ws.send(
      JSON.stringify({
        type: "connected",
        data: {
          message: "连接建立",
          updateTime: Date.now(),
        },
      } as WebSocketMessage<"connected">),
    );

    ws.send(
      JSON.stringify({
        type: "sessionHistories",
        data: {
          sessionHistories: await getSessionHistories(),
        },
      } as WebSocketMessage<"sessionHistories">),
    );
  }

  handleClose(ws: ServerWebSocket): void {
    const conversationId = broadcaster.findConversationIdByWs(ws);
    if (!conversationId) {
      return;
    }

    broadcaster.removeConnection(conversationId, ws);
  }

  private async handleLoadTaskMessage(
    ws: ServerWebSocket,
    taskId: string,
    parsedMessage: UserSendWebSocketMessage,
  ): Promise<void> {
    const conversation = conversationRepository.load(taskId);

    if (!conversation) {
      logger.warn(`[Server] 任务不存在: ${taskId}`);
      this.sendSocketError(ws, `任务 ${taskId} 不存在`, "TASK_NOT_FOUND");
      return;
    }

    this.attachConnectionAndAck(ws, taskId, parsedMessage, conversation.status);

    const resolver = getResolver(parsedMessage.type as USER_SEND_MESSAGE_NAME, conversation);
    await resolver.process(parsedMessage.data);
  }

  private attachConnectionAndAck(
    ws: ServerWebSocket,
    taskId: string,
    parsedMessage: UserSendWebSocketMessage,
    status: ConversationStatus,
  ): void {
    if (!broadcaster.hasConnection(taskId, ws)) {
      broadcaster.addConnection(taskId, ws);
    }

    broadcaster.broadcast(taskId, {
      type: "ack",
      data: {
        taskId,
        targetMessage: parsedMessage,
        status: status === "streaming" ? "failed" : "acked",
      },
    });
  }

  private resolveTaskId(parsedMessage: UserSendWebSocketMessage): string {
    if (parsedMessage.type === "createTask") {
      return uuidV4();
    }

    const taskId = (parsedMessage.data as { taskId?: unknown }).taskId;
    return typeof taskId === "string" && taskId.trim() ? taskId.trim() : uuidV4();
  }

  private async tryHandleRegisteredMessage(
    ws: ServerWebSocket,
    rawMessage: unknown,
  ): Promise<boolean> {
    const type = this.extractMessageType(rawMessage);
    if (!type || !this.messageRegistry?.has(type)) {
      return false;
    }

    const messageDef = this.messageRegistry.get(type);
    if (!messageDef) {
      return false;
    }

    const validationResult = messageDef.schema.safeParse(rawMessage);
    if (!validationResult.success) {
      const issue = validationResult.error.issues[0];
      const path = issue?.path?.length ? issue.path.join(".") : "message";
      this.sendSocketError(
        ws,
        `自定义消息 "${type}" 校验失败: ${path} ${issue?.message || "invalid payload"}`,
        "CUSTOM_MESSAGE_VALIDATION_ERROR",
      );
      return true;
    }

    if (!messageDef.handler) {
      this.sendSocketError(
        ws,
        `自定义消息 "${type}" 已注册，但未提供 handler`,
        "CUSTOM_MESSAGE_HANDLER_MISSING",
      );
      return true;
    }

    try {
      await messageDef.handler(validationResult.data.data as never);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[Server] 自定义消息 "${type}" handler 执行失败:`, error);
      this.sendSocketError(
        ws,
        `自定义消息 "${type}" handler 执行失败: ${message}`,
        "CUSTOM_MESSAGE_HANDLER_ERROR",
      );
    }

    return true;
  }

  private handleInvalidMessage(
    ws: ServerWebSocket,
    rawMessage: unknown,
    issue: { path?: PropertyKey[]; message?: string } | undefined,
  ): void {
    const type = this.extractMessageType(rawMessage);
    if (type) {
      if (this.isBuiltInUserMessageType(type)) {
        const path = issue?.path?.length ? issue.path.join(".") : "message";
        this.sendSocketError(
          ws,
          `内置消息 "${type}" 校验失败: ${path} ${issue?.message || "invalid payload"}`,
          "INVALID_MESSAGE",
        );
        return;
      }

      this.sendSocketError(ws, `不支持的消息类型: ${type}`, "UNSUPPORTED_MESSAGE_TYPE");
      return;
    }

    this.sendSocketError(ws, "消息格式错误：缺少有效的 type 字段", "INVALID_MESSAGE");
  }

  private isBuiltInUserMessageType(type: string): boolean {
    return UserSendMessageSchema.options.some((option) => option.shape.type.value === type);
  }

  private extractMessageType(rawMessage: unknown): string | null {
    if (!rawMessage || typeof rawMessage !== "object") {
      return null;
    }

    const type = (rawMessage as Record<string, unknown>).type;
    return typeof type === "string" ? type : null;
  }

  private sendSocketError(ws: ServerWebSocket, message: string, code: SocketErrorCode): void {
    ws.send(
      JSON.stringify({
        type: "error",
        data: {
          message,
          code,
          updateTime: Date.now(),
        },
      } as WebSocketMessage<"error">),
    );
  }
}

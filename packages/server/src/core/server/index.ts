import type {
  ConversationStatus,
  USER_SEND_MESSAGE_NAME,
  WebSocketMessage,
} from "@amigo-llm/types";
import { UserSendMessageSchema, type UserSendWebSocketMessage } from "@amigo-llm/types";
import Bun, { type ServerWebSocket } from "bun";
import { v4 as uuidV4 } from "uuid";
import { z } from "zod";
import { broadcaster, conversationRepository, taskOrchestrator } from "@/core/conversation";
import { getResolver } from "@/core/messageResolver";
import { setGlobalState } from "@/globalState";
import { getSessionHistories } from "@/utils/getSessions";
import { logger } from "@/utils/logger";
import { createOssPostPolicy, deleteOssObject, getOssUploadConfig } from "@/utils/ossUpload";
import type { ServerConfig } from "../config";
import { type LlmFactory, setLlmFactory } from "../model";
import type { MessageRegistry, ToolRegistry } from "../registry";

/**
 * 服务器构造选项
 */
export interface AmigoServerOptions {
  /** 服务器配置 */
  config: ServerConfig;
  /** 工具注册表 */
  toolRegistry?: ToolRegistry;
  /** 消息注册表 */
  messageRegistry?: MessageRegistry;
  /** 模型工厂（可选，默认从环境变量创建） */
  llmFactory?: LlmFactory;
  /** 额外自动批准的工具名称（在内置默认列表之外） */
  autoApproveToolNames?: string[];
  /** 全局追加系统提示词（应用级特化） */
  extraSystemPrompt?: string;
}

/**
 * 服务接口暴露
 */
class AmigoServer {
  private port: number;
  private _toolRegistry?: ToolRegistry;
  private _messageRegistry?: MessageRegistry;
  private _server?: ReturnType<typeof Bun.serve>;

  constructor(options: AmigoServerOptions) {
    this.port = options.config.port;
    setGlobalState("globalStoragePath", options.config.storagePath);
    this._toolRegistry = options.toolRegistry;
    this._messageRegistry = options.messageRegistry;
    setLlmFactory(options.llmFactory);

    // 将注册表中的工具和消息存储到全局状态
    if (options.toolRegistry) {
      setGlobalState("registryTools", options.toolRegistry.getAll());
    }
    if (options.messageRegistry) {
      setGlobalState("registryMessages", options.messageRegistry.getAll());
    }
    setGlobalState("autoApproveToolNames", options.autoApproveToolNames || []);
    setGlobalState("extraSystemPrompt", options.extraSystemPrompt || "");
  }

  get toolRegistry(): ToolRegistry | undefined {
    return this._toolRegistry;
  }

  get messageRegistry(): MessageRegistry | undefined {
    return this._messageRegistry;
  }

  get serverHandle(): ReturnType<typeof Bun.serve> | undefined {
    return this._server;
  }

  get isRunning(): boolean {
    return !!this._server;
  }

  private sendSocketError(
    ws: ServerWebSocket,
    message: string,
    code:
      | "TASK_NOT_FOUND"
      | "INVALID_MESSAGE"
      | "UNSUPPORTED_MESSAGE_TYPE"
      | "CUSTOM_MESSAGE_VALIDATION_ERROR"
      | "CUSTOM_MESSAGE_HANDLER_MISSING"
      | "CUSTOM_MESSAGE_HANDLER_ERROR",
  ): void {
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

  private extractMessageType(rawMessage: unknown): string | null {
    if (!rawMessage || typeof rawMessage !== "object") {
      return null;
    }
    const type = (rawMessage as Record<string, unknown>).type;
    return typeof type === "string" ? type : null;
  }

  private jsonResponse(data: unknown, init?: ResponseInit): Response {
    const status = init?.status || 200;
    return new Response(status === 204 ? null : JSON.stringify(data), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST,OPTIONS",
        "access-control-allow-headers": "content-type",
        ...(init?.headers || {}),
      },
    });
  }

  private async handleHttpRequest(req: Request): Promise<Response | null> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/uploads/oss/")) {
      return this.jsonResponse({}, { status: 204 });
    }

    if (req.method === "POST" && url.pathname === "/api/uploads/oss/policy") {
      const ossConfig = getOssUploadConfig();
      if (!ossConfig) {
        return this.jsonResponse(
          {
            error: "OSS upload is not configured",
            code: "OSS_NOT_CONFIGURED",
          },
          { status: 501 },
        );
      }

      const body = await req.json().catch(() => null);
      const schema = z.object({
        fileName: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(255),
        size: z
          .number()
          .int()
          .positive()
          .max(1024 * 1024 * 1024),
      });
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return this.jsonResponse(
          {
            error: "Invalid request body",
            code: "INVALID_OSS_POLICY_REQUEST",
            issues: parsed.error.issues,
          },
          { status: 400 },
        );
      }

      const policy = createOssPostPolicy(ossConfig, parsed.data);
      return this.jsonResponse({
        provider: "aliyun-oss",
        ...policy,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/uploads/oss/delete") {
      const ossConfig = getOssUploadConfig();
      if (!ossConfig) {
        return this.jsonResponse(
          {
            error: "OSS upload is not configured",
            code: "OSS_NOT_CONFIGURED",
          },
          { status: 501 },
        );
      }

      const body = await req.json().catch(() => null);
      const schema = z.object({
        objectKey: z.string().min(1).max(1024),
      });
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return this.jsonResponse(
          {
            error: "Invalid request body",
            code: "INVALID_OSS_DELETE_REQUEST",
            issues: parsed.error.issues,
          },
          { status: 400 },
        );
      }

      try {
        await deleteOssObject(ossConfig, parsed.data.objectKey);
        return this.jsonResponse({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return this.jsonResponse(
          {
            error: message,
            code: "OSS_DELETE_FAILED",
          },
          { status: 502 },
        );
      }
    }

    return null;
  }

  private async tryHandleRegisteredMessage(
    ws: ServerWebSocket,
    rawMessage: unknown,
  ): Promise<boolean> {
    const type = this.extractMessageType(rawMessage);
    if (!type || !this._messageRegistry?.has(type)) {
      return false;
    }

    const messageDef = this._messageRegistry.get(type);
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

  private isBuiltInUserMessageType(type: string): boolean {
    return UserSendMessageSchema.options.some((option) => option.shape.type.value === type);
  }

  start(): ReturnType<typeof Bun.serve> {
    if (this._server) {
      return this._server;
    }

    this._server = Bun.serve({
      fetch: async (req, server) => {
        const httpResponse = await this.handleHttpRequest(req);
        if (httpResponse) {
          return httpResponse;
        }

        if (server.upgrade(req)) {
          return;
        }
        return new Response("Upgrade failed", { status: 500 });
      },
      port: this.port,
      websocket: {
        message: async (ws: ServerWebSocket, message: string) => {
          try {
            const rawMessage = JSON.parse(message) as unknown;

            const builtInMessageParse = UserSendMessageSchema.safeParse(rawMessage);
            if (!builtInMessageParse.success) {
              const handledByCustomMessage = await this.tryHandleRegisteredMessage(ws, rawMessage);
              if (handledByCustomMessage) {
                return;
              }

              const type = this.extractMessageType(rawMessage);
              if (type) {
                if (this.isBuiltInUserMessageType(type)) {
                  const issue = builtInMessageParse.error.issues[0];
                  const path = issue?.path?.length ? issue.path.join(".") : "message";
                  this.sendSocketError(
                    ws,
                    `内置消息 "${type}" 校验失败: ${path} ${issue?.message || "invalid payload"}`,
                    "INVALID_MESSAGE",
                  );
                  return;
                }
                this.sendSocketError(ws, `不支持的消息类型: ${type}`, "UNSUPPORTED_MESSAGE_TYPE");
              } else {
                this.sendSocketError(ws, "消息格式错误：缺少有效的 type 字段", "INVALID_MESSAGE");
              }
              return;
            }

            const parsedMessage = builtInMessageParse.data as UserSendWebSocketMessage;

            // 根据消息类型获取或生成 taskId
            let taskId: string;
            if (parsedMessage.type === "createTask") {
              // createTask 消息不包含 taskId，生成新的 UUID
              taskId = uuidV4();
            } else {
              // 其他消息从 data 中获取 taskId
              taskId = (parsedMessage.data as any).taskId?.trim() || uuidV4();
            }

            // 特殊处理 loadTask：检查任务是否存在
            if (parsedMessage.type === "loadTask") {
              const conversation = conversationRepository.load(taskId);

              if (!conversation) {
                // 任务不存在，直接发送错误消息
                logger.warn(`[Server] 任务不存在: ${taskId}`);
                this.sendSocketError(ws, `任务 ${taskId} 不存在`, "TASK_NOT_FOUND");
                return;
              }

              // 任务存在，继续正常处理
              if (!broadcaster.hasConnection(taskId, ws)) {
                broadcaster.addConnection(taskId, ws);
              }

              broadcaster.broadcast(taskId, {
                type: "ack",
                data: {
                  taskId,
                  targetMessage: parsedMessage,
                  status: conversation.status === "streaming" ? "failed" : "acked",
                },
              });

              const resolver = getResolver(
                parsedMessage.type as USER_SEND_MESSAGE_NAME,
                conversation,
              );
              await resolver.process(parsedMessage.data);
              return;
            }

            // 其他消息类型：获取或创建会话
            const conversation = conversationRepository.getOrLoad(taskId);

            // 管理 WebSocket 连接
            if (!broadcaster.hasConnection(taskId, ws)) {
              broadcaster.addConnection(taskId, ws);
            }

            // 发送 ack
            broadcaster.broadcast(taskId, {
              type: "ack",
              data: {
                taskId,
                targetMessage: parsedMessage,
                status: conversation.status === "streaming" ? "failed" : "acked",
              },
            });

            // 处理消息
            const resolver = getResolver(
              parsedMessage.type as USER_SEND_MESSAGE_NAME,
              conversation,
            );
            await resolver.process(parsedMessage.data);
          } catch (error) {
            logger.error("处理消息时出错:", error);
          }
        },

        open: async (ws: ServerWebSocket) => {
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
        },

        close: (ws: ServerWebSocket) => {
          const conversationId = broadcaster.findConversationIdByWs(ws);
          if (conversationId) {
            broadcaster.removeConnection(conversationId, ws);

            const conversation = conversationRepository.get(conversationId);
            const isLastConnection = broadcaster.getConnectionCount(conversationId) === 0;
            const NotInterruptableStatusList: ConversationStatus[] = [
              "completed",
              "waiting_tool_confirmation",
              "idle",
              "error",
              "aborted",
            ];
            const isActiveStatus = !NotInterruptableStatusList.includes(
              conversation?.status as ConversationStatus,
            );

            // 所有连接断开且状态不是 completed/idle 时，中断会话
            if (isLastConnection && isActiveStatus && conversation) {
              taskOrchestrator.interrupt(conversation);
            }
          }
        },

        drain: () => {},
      },
    });

    return this._server;
  }

  /**
   * 兼容旧 API。建议使用 start()
   */
  init(): ReturnType<typeof Bun.serve> {
    return this.start();
  }

  stop(): void {
    if (!this._server) {
      return;
    }
    this._server.stop();
    this._server = undefined;
  }
}

export default AmigoServer;

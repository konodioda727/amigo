import type {
  ConversationStatus,
  USER_SEND_MESSAGE_NAME,
  WebSocketMessage,
} from "@amigo-llm/types";
import Bun, { type ServerWebSocket } from "bun";
import { v4 as uuidV4 } from "uuid";
import { broadcaster, conversationRepository, taskOrchestrator } from "@/core/conversation";
import { getResolver } from "@/core/messageResolver";
import { transcribeAudio } from "@/core/transcribe";
import { setGlobalState } from "@/globalState";
import { getSessionHistories } from "@/utils/getSessions";
import { logger } from "@/utils/logger";
import type { ServerConfig } from "../config";
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
}

/**
 * 服务接口暴露
 */
class AmigoServer {
  private port: number;
  private _toolRegistry?: ToolRegistry;
  private _messageRegistry?: MessageRegistry;

  constructor(options: AmigoServerOptions) {
    this.port = options.config.port;
    setGlobalState("globalStoragePath", options.config.storagePath);
    this._toolRegistry = options.toolRegistry;
    this._messageRegistry = options.messageRegistry;

    // 将注册表中的工具和消息存储到全局状态
    if (options.toolRegistry) {
      setGlobalState("registryTools", options.toolRegistry.getAll());
    }
    if (options.messageRegistry) {
      setGlobalState("registryMessages", options.messageRegistry.getAll());
    }
  }

  get toolRegistry(): ToolRegistry | undefined {
    return this._toolRegistry;
  }

  get messageRegistry(): MessageRegistry | undefined {
    return this._messageRegistry;
  }

  init() {
    Bun.serve({
      fetch: async (req: any, server: any) => {
        const url = new URL(req.url);

        // CORS 预检请求
        if (req.method === "OPTIONS") {
          return new Response(null, {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
            },
          });
        }

        // 语音转录 API
        if (url.pathname === "/api/transcribe" && req.method === "POST") {
          try {
            const body = (await req.json()) as { audio: string; format: string };
            const { audio, format } = body;

            if (!audio || !format) {
              return new Response(
                JSON.stringify({ error: "Missing required fields: audio, format" }),
                {
                  status: 400,
                  headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                  },
                },
              );
            }

            const text = await transcribeAudio(audio, format);
            return new Response(JSON.stringify({ text }), {
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            });
          } catch (error: any) {
            logger.error("[Server] 转录请求处理失败:", error);
            return new Response(
              JSON.stringify({ error: error.message || "Transcription failed" }),
              {
                status: 500,
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*",
                },
              },
            );
          }
        }

        // WebSocket 升级
        if (server.upgrade(req)) {
          return;
        }
        return new Response("Not found", { status: 404 });
      },
      port: this.port,
      websocket: {
        message: async (ws: ServerWebSocket, message: string) => {
          try {
            const parsedMessage = JSON.parse(message) as WebSocketMessage<USER_SEND_MESSAGE_NAME>;

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
                ws.send(
                  JSON.stringify({
                    type: "error",
                    data: {
                      message: `任务 ${taskId} 不存在`,
                      code: "TASK_NOT_FOUND",
                      updateTime: Date.now(),
                    },
                  } as WebSocketMessage<"error">),
                );
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
  }
}

export default AmigoServer;

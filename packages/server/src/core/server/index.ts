import type { USER_SEND_MESSAGE_NAME, WebSocketMessage } from "@amigo-llm/types";
import Bun, { type ServerWebSocket } from "bun";
import { v4 as uuidV4 } from "uuid";
import { broadcaster, conversationRepository, taskOrchestrator } from "@/core/conversation";
import { getResolver } from "@/core/messageResolver";
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
      fetch: (req, server) => {
        if (server.upgrade(req)) {
          return;
        }
        return new Response("Upgrade failed", { status: 500 });
      },
      port: this.port,
      websocket: {
        message: async (ws: ServerWebSocket, message: string) => {
          try {
            const parsedMessage = JSON.parse(message) as WebSocketMessage<USER_SEND_MESSAGE_NAME>;
            // 如果 taskId 为空或空字符串，生成新的 UUID
            const taskId = parsedMessage.data.taskId?.trim() || uuidV4();

            // 获取或创建会话
            const conversation = conversationRepository.getOrLoad(taskId);
            const isNewSession = conversation.isNew;

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
                updateTime: Date.now(),
                status: conversation.status === "streaming" ? "failed" : "acked",
              },
            });

            // 处理消息
            const resolver = getResolver(
              parsedMessage.type as USER_SEND_MESSAGE_NAME,
              conversation,
            );
            await resolver.process(parsedMessage.data);

            // 新会话发送历史列表
            if (isNewSession) {
              broadcaster.broadcast(taskId, {
                type: "sessionHistories",
                data: {
                  sessionHistories: await getSessionHistories(),
                },
              });
            }
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
            const isActiveStatus =
              conversation?.status !== "completed" && conversation?.status !== "idle";

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

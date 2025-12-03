import type { USER_SEND_MESSAGE_NAME, WebSocketMessage } from "@amigo-llm/types";
import Bun, { type ServerWebSocket } from "bun";
import { v4 as uuidV4 } from "uuid";
import { ConversationManager } from "@/core/conversationManager";
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

    // 将注册表中的工具和消息存储到全局状态，供 ConversationManager 使用
    if (options.toolRegistry) {
      setGlobalState("registryTools", options.toolRegistry.getAll());
    }
    if (options.messageRegistry) {
      setGlobalState("registryMessages", options.messageRegistry.getAll());
    }
  }

  /**
   * 获取工具注册表
   */
  get toolRegistry(): ToolRegistry | undefined {
    return this._toolRegistry;
  }

  /**
   * 获取消息注册表
   */
  get messageRegistry(): MessageRegistry | undefined {
    return this._messageRegistry;
  }

  init() {
    Bun.serve({
      fetch: (req: any, server: any) => {
        if (server.upgrade(req)) {
          return;
        }
        return new Response("Upgrade failed", { status: 500 });
      },
      port: this.port,
      websocket: {
        message: async (ws: ServerWebSocket, message: string) => {
          let parsedMessage: WebSocketMessage<USER_SEND_MESSAGE_NAME> | undefined;
          try {
            parsedMessage = JSON.parse(message) as WebSocketMessage<USER_SEND_MESSAGE_NAME>;

            const taskId = parsedMessage.data.taskId || uuidV4();
            let manager = ConversationManager.taskMapToConversationManager[taskId];
            let isNewSession = false;
            if (!manager) {
              manager = new ConversationManager({
                taskId,
              });
              ConversationManager.taskMapToConversationManager[taskId] = manager;
              isNewSession = manager.isNewSession();
            }
            if (!manager.connections.includes(ws)) {
              manager.addConnection(ws);
            }
            manager.emitMessage({
              type: "ack",
              data: {
                taskId,
                targetMessage: parsedMessage,
                updateTime: Date.now().valueOf(),
                status: manager.conversationStatus === "streaming" ? "failed" : "acked",
              },
            });

            // 创建对应的resolver
            const resolver = getResolver(parsedMessage.type as USER_SEND_MESSAGE_NAME, manager);
            await resolver.process(parsedMessage.data);

            // 如果是新会话，在处理完消息后发送更新后的会话历史列表
            if (isNewSession) {
              manager.emitMessage({
                type: "sessionHistories",
                data: {
                  sessionHistories: await getSessionHistories(),
                },
              });
            }
          } catch (error: any) {
            logger.error("处理消息时出错:", error);
          }
        },
        open: async (ws: ServerWebSocket) => {
          ws.send(
            JSON.stringify({
              type: "connected",
              data: {
                message: "连接建立",
                updateTime: Date.now().valueOf(),
              },
            } as WebSocketMessage<"connected">),
          );

          // 发送会话历史列表
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
          const managers = Object.values(ConversationManager.taskMapToConversationManager);
          for (const manager of managers) {
            if (manager.connections.includes(ws)) {
              manager.removeConnection(ws);
              const isLastConnectionAndSreaming =
                !manager.connections.length && manager.conversationStatus === "streaming";

              if (isLastConnectionAndSreaming) manager.interrupt();
              return;
            }
          }
        },
        drain: () => {},
      },
    });
  }
}

export default AmigoServer;

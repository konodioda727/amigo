import type { USER_SEND_MESSAGE_NAME, WebSocketMessage } from "@amigo/types";
import Bun, { type ServerWebSocket } from "bun";
import { ConversationManager } from "@/core/conversationManager";
import { getResolver } from "@/core/messageResolver";
import { setGlobalState } from "@/globalState";
import { getSessionHistories } from "@/utils/getSessions";

/**
 * 服务接口暴露
 */
class AmigoServer {
  private port: string = "10013";
  /**
   * taskId 与 conversationManager 的映射
   */
  public conversationManagerMapping: Record<string, ConversationManager> = {};
  constructor({ port, globalStoragePath }: { port: string; globalStoragePath: string }) {
    this.port = port;
    setGlobalState("globalStoragePath", globalStoragePath);
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
        message: (ws: ServerWebSocket, message: string) => {
          let parsedMessage: WebSocketMessage<USER_SEND_MESSAGE_NAME> | undefined;
          try {
            // 解析消息
            parsedMessage = JSON.parse(message) as WebSocketMessage<USER_SEND_MESSAGE_NAME>;

            let manager = this.conversationManagerMapping[parsedMessage.data.taskId];

            if (!manager) {
              manager = ConversationManager.createConversationManager({
                taskId: parsedMessage.data.taskId,
              });
              this.conversationManagerMapping[parsedMessage.data.taskId] = manager;
            }
            if (!manager.connections.includes(ws)) {
              manager.addConnection(ws);
            }
            manager.emitMessage({
              type: "ack",
              data: {
                taskId: parsedMessage.data.taskId,
                targetMessage: parsedMessage,
                updateTime: Date.now().valueOf(),
                status: manager.conversationStatus === "streaming" ? "failed" : "acked",
              },
            });
            // 创建对应的resolver
            const resolver = getResolver(parsedMessage.type as USER_SEND_MESSAGE_NAME, manager);
            resolver.process(parsedMessage.data);
          } catch (error: any) {
            console.error("处理消息时出错:", error);
          }
        },
        open: async (ws: ServerWebSocket) => {
          ws.send(
            JSON.stringify({
              type: "connected",
              data: {
                message: "连接建立",
                sessionHistories: await getSessionHistories(),
                updateTime: Date.now().valueOf(),
              },
            } as WebSocketMessage<"connected">),
          );
        },
        close: (ws: ServerWebSocket) => {
          const managers = Object.values(this.conversationManagerMapping);
          for (const manager of managers) {
            if (manager.connections.includes(ws)) {
              manager.removeConnection(ws);
              const isLastConnectionAndSreaming =
                !manager.connections.length &&
                manager.conversationStatus === "streaming"
                
              if(isLastConnectionAndSreaming) manager.interrupt();
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

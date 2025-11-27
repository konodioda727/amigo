import type { USER_SEND_MESSAGE_NAME, WebSocketMessage } from "@amigo/types";
import Bun, { type ServerWebSocket } from "bun";
import { ConversationManager } from "@/core/conversationManager";
import { getResolver } from "@/core/messageResolver";
import { setGlobalState } from "@/globalState";
import { getSessionHistories } from "@/utils/getSessions";
import { logger } from "@/utils/logger";
import { v4 as uuidV4 } from "uuid";

/**
 * 服务接口暴露
 */
class AmigoServer {
  private port: string = "10013";
  constructor({ port, globalStoragePath }: { port: string; globalStoragePath: string }) {
    this.port = port;
    setGlobalState("globalStoragePath", globalStoragePath);
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

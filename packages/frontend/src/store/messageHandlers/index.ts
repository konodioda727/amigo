import type { WebSocketMessage, SERVER_SEND_MESSAGE_NAME } from "@amigo/types";
import type { WebSocketStore } from "../websocket";
import { handleAck } from "./ackHandler.js";
import { handleSessionHistories } from "./sessionHistoriesHandler.js";
import { handleStateChange } from "./stateChangeHandler.js";
import { handleAssignTaskUpdated } from "./assignTaskUpdatedHandler.js";
import { handleTaskHistory } from "./taskHistoryHandler.js";
import { handleDefault } from "./defaultHandler.js";

export type MessageHandler = (
  message: WebSocketMessage<any>,
  store: WebSocketStore
) => boolean; // 返回 true 表示已处理，不需要继续

const handlers: Partial<Record<SERVER_SEND_MESSAGE_NAME, MessageHandler>> = {
  sessionHistories: handleSessionHistories,
  ack: handleAck,
  conversationOver: handleStateChange,
  interrupt: handleStateChange,
  alert: handleStateChange,
  assignTaskUpdated: handleAssignTaskUpdated,
  taskHistory: handleTaskHistory,
};

export const getMessageHandler = (type: SERVER_SEND_MESSAGE_NAME): MessageHandler => {
  return handlers[type] || handleDefault;
};

import type { SERVER_SEND_MESSAGE_NAME, WebSocketMessage } from "@amigo-llm/types";
import type { WebSocketStore } from "../websocket";
import { handleAck } from "./ackHandler";
import { handleAssignTaskUpdated } from "./assignTaskUpdatedHandler";
import { handleDefault } from "./defaultHandler";
import { handleSessionHistories } from "./sessionHistoriesHandler";
import { handleStateChange } from "./stateChangeHandler";
import { handleTaskHistory } from "./taskHistoryHandler";

export type MessageHandler = (message: WebSocketMessage<any>, store: WebSocketStore) => boolean; // 返回 true 表示已处理，不需要继续

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

import type { SERVER_SEND_MESSAGE_NAME, WebSocketMessage } from "@amigo-llm/types";
import type { WebSocketStore } from "../websocket";
import { handleAck } from "./ackHandler";
import { handleDefault } from "./defaultHandler";
import { handleSessionHistories } from "./sessionHistoriesHandler";
import { handleStateChange } from "./stateChangeHandler";
import { handleTaskCreated } from "./taskCreatedHandler";
import { handleTaskDeleted } from "./taskDeletedHandler";
import { handleTaskHistory } from "./taskHistoryHandler";
import { handleWaitingToolCall } from "./waitingToolCallHandler";

export type MessageHandler = (message: WebSocketMessage<any>, store: WebSocketStore) => boolean; // 返回 true 表示已处理，不需要继续

const handlers: Partial<Record<SERVER_SEND_MESSAGE_NAME, MessageHandler>> = {
  sessionHistories: handleSessionHistories,
  ack: handleAck,
  waiting_tool_call: handleWaitingToolCall,
  conversationOver: handleStateChange,
  interrupt: handleStateChange,
  alert: handleStateChange,
  taskHistory: handleTaskHistory,
  taskCreated: handleTaskCreated,
  taskDeleted: handleTaskDeleted,
};

export const getMessageHandler = (type: SERVER_SEND_MESSAGE_NAME): MessageHandler => {
  return handlers[type] || handleDefault;
};

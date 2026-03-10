import type { WebSocketMessage } from "@amigo-llm/types";
import type { WebSocketStore } from "../websocket";

export const handleTaskStatusMapUpdated = (
  message: WebSocketMessage<any>,
  store: WebSocketStore,
) => {
  const data = message.data as any;
  if (data.taskId && data.subTasks) {
    store.setTaskStatusMap(data.taskId, data.subTasks);
  }
  if (data.taskId && Array.isArray(data.autoApproveToolNames)) {
    store.setTaskAutoApproveToolNames(data.taskId, data.autoApproveToolNames);
  }
  if (data.taskId && "contextUsage" in data) {
    store.setTaskContextUsage(data.taskId, data.contextUsage);
  }
  return true;
};

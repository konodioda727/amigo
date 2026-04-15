import type { WebSocketMessage } from "@amigo-llm/types";
import type { WebSocketStore } from "../websocket";

export const handleTaskStatusMapUpdated = (
  message: WebSocketMessage<any>,
  store: WebSocketStore,
) => {
  const data = message.data as any;
  if (data.taskId && data.executionTasks) {
    store.setTaskStatusMap(data.taskId, data.executionTasks);
  }
  if (data.taskId && Array.isArray(data.autoApproveToolNames)) {
    store.setTaskAutoApproveToolNames(data.taskId, data.autoApproveToolNames);
  }
  if (data.taskId && "contextUsage" in data) {
    store.setTaskContextUsage(data.taskId, data.contextUsage);
  }
  if (data.taskId && "context" in data) {
    store.setTaskContext(data.taskId, data.context);
  }
  if (data.taskId && "workflowState" in data) {
    store.setTaskWorkflowState(data.taskId, data.workflowState);
  }
  return true;
};

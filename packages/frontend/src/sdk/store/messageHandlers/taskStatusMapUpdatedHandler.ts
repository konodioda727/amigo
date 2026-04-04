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
  if (data.taskId && "context" in data) {
    store.setTaskContext(data.taskId, data.context);
  }
  if (data.taskId === store.mainTaskId && data.documents && typeof data.documents === "object") {
    const phases = ["requirements", "design", "taskList"] as const;
    for (const phase of phases) {
      if (typeof data.documents[phase] === "string") {
        store.setDocContent(data.documents[phase], undefined, phase);
      }
    }
  }
  return true;
};

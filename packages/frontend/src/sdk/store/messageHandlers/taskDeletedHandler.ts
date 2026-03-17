import type { WebSocketMessage } from "@amigo-llm/types";
import type { WebSocketStore } from "../websocket";

export function handleTaskDeleted(
  message: WebSocketMessage<"taskDeleted">,
  store: WebSocketStore,
): boolean {
  const { taskId, deletedSubTaskIds } = message.data;
  const allDeletedIds = [taskId, ...deletedSubTaskIds];
  const remainingHistories = store.taskHistories.filter(
    (history) => !allDeletedIds.includes(history.taskId),
  );

  for (const id of allDeletedIds) {
    store.unregisterTask(id);
  }

  store.handleSessionHistories(remainingHistories);

  if (store.mainTaskId === taskId) {
    store.createNewConversation();
  } else if (store.activeTaskId && allDeletedIds.includes(store.activeTaskId)) {
    store.setActiveTask(store.mainTaskId || null);
  }

  return false;
}

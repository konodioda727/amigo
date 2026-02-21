import type { WebSocketMessage } from "@amigo-llm/types";
import type { WebSocketStore } from "../websocket";

export function handleTaskDeleted(
  message: WebSocketMessage<"taskDeleted">,
  store: WebSocketStore,
): boolean {
  const { taskId, deletedSubTaskIds } = message.data;

  // Remove all deleted tasks from store
  const allDeletedIds = [taskId, ...deletedSubTaskIds];

  for (const id of allDeletedIds) {
    // Remove from tasks
    if (store.tasks[id]) {
      delete store.tasks[id];
    }

    // Remove from task histories
    store.taskHistories = store.taskHistories.filter((history) => history.taskId !== id);
  }

  // If the deleted task was the main task, clear it
  if (store.mainTaskId === taskId) {
    store.mainTaskId = "";
  }

  console.log(
    `[taskDeletedHandler] Deleted task ${taskId} and ${deletedSubTaskIds.length} subtasks`,
  );

  return false;
}

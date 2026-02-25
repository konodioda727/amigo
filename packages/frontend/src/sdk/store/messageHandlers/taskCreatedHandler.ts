import type { WebSocketMessage } from "@amigo-llm/types";
import type { WebSocketStore } from "../websocket";

export function handleTaskCreated(
  message: WebSocketMessage<"taskCreated">,
  store: WebSocketStore,
): boolean {
  const { taskId, sessionHistories } = message.data;

  // 绑定新会话 taskId（不触发 loadTask，避免无意义历史加载）
  store.setCurrentTaskIdsForNewConversation(taskId);

  // createTask 场景下 taskCreated 可能先于 ack 到达，先进入 streaming，后续 ack 会再次确认状态。
  if (store.isCreatingConversation) {
    store.setTaskStatus(taskId, "streaming");
  }

  // 更新会话历史列表
  store.handleSessionHistories(sessionHistories);

  return false;
}

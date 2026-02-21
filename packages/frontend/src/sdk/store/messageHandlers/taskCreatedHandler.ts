import type { WebSocketMessage } from "@amigo-llm/types";
import type { WebSocketStore } from "../websocket";

export function handleTaskCreated(
  message: WebSocketMessage<"taskCreated">,
  store: WebSocketStore,
): boolean {
  const { taskId, sessionHistories } = message.data;

  // 只更新 mainTaskId，不发送 loadTask（因为这是新创建的任务，不需要加载历史）
  store.mainTaskId = taskId;

  // 注册任务
  store.registerTask(taskId);

  // 更新会话历史列表
  store.handleSessionHistories(sessionHistories);

  return false;
}

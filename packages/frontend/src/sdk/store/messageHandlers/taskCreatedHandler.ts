import type { TaskCreatedMessageData } from "@amigo-llm/types";
import type { WebSocketStore } from "../websocket";

export function handleTaskCreated(this: WebSocketStore, data: TaskCreatedMessageData): void {
  const { taskId, sessionHistories } = data;

  // 只更新 mainTaskId，不发送 loadTask（因为这是新创建的任务，不需要加载历史）
  this.mainTaskId = taskId;

  // 注册任务
  this.registerTask(taskId);

  // 更新会话历史列表
  this.handleSessionHistories(sessionHistories);
}

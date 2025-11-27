import type { MessageHandler } from "./index.js";

export const handleTaskHistory: MessageHandler = (message, store) => {
  const messageData = message.data as any;
  const taskId = messageData.taskId || store.mainTaskId;
  const historyMessages = messageData.messages || [];

  // taskHistory 包含完整的历史记录，应该替换而不是追加
  store.handleTaskHistory(taskId, historyMessages);

  return true; // taskHistory 已处理，不需要添加到 rawMessages
};

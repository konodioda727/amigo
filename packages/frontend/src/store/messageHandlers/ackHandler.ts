import type { MessageHandler } from "./index.js";

export const handleAck: MessageHandler = (message, store) => {
  const messageData = message.data as any;
  const state = store;
  let taskId = messageData.taskId || state.mainTaskId;

  // 设置主任务 ID
  if (messageData.taskId && !state.mainTaskId) {
    store.setMainTaskId(messageData.taskId);
    taskId = messageData.taskId;
  }

  // 处理用户消息确认
  if (messageData.targetMessage?.type === "userSendMessage") {
    store.setLoading(taskId, true);
    store.updateUserMessageStatus(taskId, messageData.targetMessage.data.message, 'acked');
  }

  // 处理 resume 消息确认
  if (messageData.targetMessage?.type === "resume") {
    store.setLoading(taskId, true);
  }

  return true; // ack 消息不需要添加到 displayMessages
};

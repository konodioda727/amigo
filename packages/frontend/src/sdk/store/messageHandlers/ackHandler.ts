import type { MessageHandler } from "./index";

export const handleAck: MessageHandler = (message, store) => {
  const messageData = message.data as any;
  const state = store;
  let taskId = messageData.taskId || state.mainTaskId;
  const targetMessageType = messageData.targetMessage?.type;
  const targetMessageData = messageData.targetMessage?.data || {};

  // 设置主任务 ID（当没有 mainTaskId 或为空字符串时）
  if (messageData.taskId && (!state.mainTaskId || state.mainTaskId.trim() === "")) {
    store.setCurrentTaskIdsForNewConversation(messageData.taskId);
    taskId = messageData.taskId;
  }

  const streamingType = ["userSendMessage", "createTask"];

  // 处理用户消息确认 - 进入 streaming 状态
  if (streamingType.includes(targetMessageType)) {
    if (taskId && !store.tasks[taskId]) {
      store.registerTask(taskId);
    }

    // createTask 不会先插入本地 pending 用户消息；在 ack 时补一条 acked 的首条用户消息。
    if (taskId && targetMessageType === "createTask") {
      const task = store.tasks[taskId];
      const incomingText = targetMessageData.message ?? "";
      const incomingAttachments = targetMessageData.attachments;

      const hasUserMessage = !!task?.rawMessages.some((msg) => {
        if (msg.type !== "userSendMessage") return false;
        const data = (msg as any).data || {};
        return (
          (data.message ?? "") === incomingText &&
          JSON.stringify(data.attachments ?? []) === JSON.stringify(incomingAttachments ?? [])
        );
      });

      if (!hasUserMessage) {
        store.addMessageToTask(taskId, {
          type: "userSendMessage",
          data: {
            message: incomingText,
            attachments: incomingAttachments,
            taskId,
            updateTime: Date.now(),
            status: "acked",
          },
        } as any);
      }
    }

    store.setCreatingConversation(false);
    store.setTaskStatus(taskId, "streaming");

    if (targetMessageType === "userSendMessage") {
      store.updateUserMessageStatus(taskId, targetMessageData.message, "acked");
    }
  }

  // 处理 resume 消息确认 - 进入 streaming 状态
  if (targetMessageType === "resume") {
    store.setTaskStatus(taskId, "streaming");
  }

  return true; // ack 消息不需要添加到 displayMessages
};

import type { MessageHandler } from "./index";

export const handleAssignTaskUpdated: MessageHandler = (message, store) => {
  // assignTaskUpdated 的处理逻辑在 messageCombiner 的 assignTaskUpdatedProcessor 中
  // 这里只需要确保消息被添加到正确的 task（parentTaskId）
  const messageData = message.data as any;

  // 如果有 parentTaskId，确保使用 parentTaskId 而不是 mainTaskId
  if (messageData.parentTaskId) {
    const parentTaskId = messageData.parentTaskId;

    // 确保 parent task 已注册
    if (!store.tasks[parentTaskId]) {
      store.registerTask(parentTaskId);
    }
  }

  return false; // 继续添加到 rawMessages，由 messageCombiner 处理
};

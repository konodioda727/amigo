import type { MessageHandler } from "./index.js";
import { toast } from "@/utils/toast";

export const handleStateChange: MessageHandler = (message, store) => {
  const messageData = message.data as any;
  const taskId = messageData.taskId || store.mainTaskId;

  switch (message.type) {
    case 'conversationOver':
    case 'interrupt':
      store.setLoading(taskId, false);
      break;
    case 'alert':
      store.setLoading(taskId, false);
      toast.error(messageData.message);
      break;
  }

  return false; // 继续添加到 displayMessages
};

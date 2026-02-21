import { toast } from "@/utils/toast";
import type { MessageHandler } from "./index";

export const handleStateChange: MessageHandler = (message, store) => {
  const messageData = message.data as any;
  const taskId = messageData.taskId || store.mainTaskId;

  switch (message.type) {
    case "conversationOver": {
      const reason = messageData.reason;

      // State machine transition based on reason
      if (reason === "interrupt") {
        store.setTaskStatus(taskId, "interrupted");
      } else if (reason === "error") {
        store.setTaskStatus(taskId, "error");
      } else if (reason === "completionResult") {
        store.setTaskStatus(taskId, "completed");
      } else {
        // Default to idle for other reasons (askFollowupQuestion, etc.)
        store.setTaskStatus(taskId, "idle");
      }
      break;
    }
    case "interrupt":
      store.setTaskStatus(taskId, "interrupted");
      break;
    case "alert":
      store.setTaskStatus(taskId, "error");
      toast.error(messageData.message);
      break;
  }

  return false; // 继续添加到 displayMessages
};

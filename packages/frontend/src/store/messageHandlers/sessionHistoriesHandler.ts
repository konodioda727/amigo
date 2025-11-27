import type { MessageHandler } from "./index.js";

export const handleSessionHistories: MessageHandler = (message, store) => {
  const messageData = message.data as any;
  store.handleSessionHistories(messageData.sessionHistories || []);
  return true; // 已处理，不需要添加到 displayMessages
};

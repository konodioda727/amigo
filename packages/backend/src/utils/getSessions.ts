import { getConversationPersistenceProvider } from "@/core/persistence";

/**
 * 获取会话历史
 * @returns 会话历史（按时间倒序排列，不包含 executionTask）
 */
export const getSessionHistories = async (userId?: string) => {
  return getConversationPersistenceProvider().listSessionHistories(userId);
};

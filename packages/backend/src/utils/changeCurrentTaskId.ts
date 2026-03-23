import type { Conversation, WebSocketBroadcaster } from "@/core/conversation";
import { getConversationPersistenceProvider } from "@/core/persistence";
import { logger } from "./logger";

/**
 * 切换当前任务ID
 */
export const changeCurrentTaskId = async (
  taskId: string,
  conversation: Conversation,
  broadcaster: WebSocketBroadcaster,
) => {
  try {
    const record = getConversationPersistenceProvider().load(taskId);

    broadcaster.broadcast(conversation.id, {
      type: "taskHistory",
      data: {
        messages: record?.websocketMessages || [],
        taskId,
        conversationStatus: conversation.status,
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.info(`Task ${taskId} not found or error loading, treating as new task:`, errorMessage);
    broadcaster.broadcast(conversation.id, {
      type: "taskHistory",
      data: {
        messages: [],
        taskId,
        conversationStatus: conversation.status,
      },
    });
  }
};

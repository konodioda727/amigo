import fs from "node:fs";
import path from "node:path";
import { StorageType } from "@amigo-llm/types";
import type { Conversation, WebSocketBroadcaster } from "@/core/conversation";
import { getTaskStoragePath } from "@/core/storage";
import { logger } from "./logger";

/**
 * 切换当前任务ID
 */
export const changeCurrentTaskId = async (
  taskId: string,
  conversation: Conversation,
  broadcaster: WebSocketBroadcaster,
) => {
  const frontendJsonPath = path.join(
    getTaskStoragePath(taskId),
    "messages",
    `${StorageType.FRONT_END}.json`,
  );
  try {
    const content = await fs.promises.readFile(frontendJsonPath, "utf-8");
    const data = JSON.parse(content);

    if (data.messages && Array.isArray(data.messages)) {
      broadcaster.broadcast(conversation.id, {
        type: "taskHistory",
        data: {
          messages: data.messages,
          taskId,
          conversationStatus: conversation.status,
        },
      });
    }
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

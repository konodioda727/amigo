import fs from "fs";
import path from "path";
import { getGlobalState } from "@/globalState";
import { StorageType } from "@amigo/types";
import type { ConversationManager } from "@/core/conversationManager";

/**
 * 切换当前任务ID
 * @param taskId 任务ID
 */
export const changeCurrentTaskId = async (taskId: string, manager: ConversationManager) => {
    const globalStoragePath = getGlobalState("globalStoragePath");

    if (!globalStoragePath) {
      console.error("globalStoragePath is not set.");
      return;
    }

    const frontendJsonPath = path.join(globalStoragePath, taskId, `${StorageType.FRONT_END}.json`);
    try {
      const content = await fs.promises.readFile(frontendJsonPath, "utf-8");
      const data = JSON.parse(content);
      // Emit all messages from the loaded task to the frontend
      if (data.messages && Array.isArray(data.messages)) {
        manager.emitMessage({
          type: "taskHistory",
          data: {
            messages: data.messages,
            taskId,
          },
        });
      }
    } catch (error: any) {
      console.error(`Error loading task ${taskId}:`, error);
      manager.emitMessage({
        type: "message",
        data: {
          message: `Error loading task ${taskId}: ${error.message || String(error)}`,
          partial: false,
        },
      });
    }
  }
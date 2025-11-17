import type { USER_SEND_MESSAGE_NAME } from "@amigo/types";
import BaseMessageResolver from "../base";
import { logger } from "@/utils/logger";
import fs from "fs";
import path from "path";
import { getGlobalState } from "@/globalState";
import { StorageType } from "@amigo/types";

export class LoadSubTaskMessageResolver extends BaseMessageResolver<"loadSubTask"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "loadSubTask";
  async process({ taskId }: { taskId: string }) {
    logger.info(`[LoadSubTaskMessageResolver] 加载子任务: ${taskId}`);
    
    const globalStoragePath = getGlobalState("globalStoragePath");

    if (!globalStoragePath) {
      logger.error("globalStoragePath is not set.");
      this.manager.emitMessage({
        type: "error",
        data: {
          message: "Storage path not configured",
        },
      });
      return;
    }

    const frontendJsonPath = path.join(globalStoragePath, taskId, `${StorageType.FRONT_END}.json`);
    try {
      const content = await fs.promises.readFile(frontendJsonPath, "utf-8");
      const data = JSON.parse(content);
      
      // 发送子任务历史消息（不影响全局状态）
      if (data.messages && Array.isArray(data.messages)) {
        this.manager.emitMessage({
          type: "subTaskHistory",
          data: {
            messages: data.messages,
            taskId,
          },
        });
        logger.info(`[LoadSubTaskMessageResolver] 成功加载子任务 ${taskId}，消息数: ${data.messages.length}`);
      } else {
        logger.warn(`[LoadSubTaskMessageResolver] 子任务 ${taskId} 没有消息`);
      }
    } catch (error: any) {
      logger.error(`Error loading subtask ${taskId}:`, error);
      this.manager.emitMessage({
        type: "error",
        data: {
          message: `Error loading subtask ${taskId}: ${error.message || String(error)}`,
        },
      });
    }
  }
}

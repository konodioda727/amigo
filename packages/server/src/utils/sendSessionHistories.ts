import { StorageType } from "@amigo-llm/types";
import fs from "fs";
import path from "path";
import type { ConversationManager } from "@/core/conversationManager";
import { getGlobalState } from "@/globalState";
import { logger } from "./logger";

/**
 * 发送会话历史列表给前端
 */
export const sendSessionHistories = async (manager: ConversationManager) => {
  const globalStoragePath = getGlobalState("globalStoragePath");

  if (!globalStoragePath) {
    logger.error("globalStoragePath is not set.");
    return;
  }

  try {
    // 读取所有任务目录
    const taskDirs = await fs.promises.readdir(globalStoragePath, { withFileTypes: true });

    const sessionHistoriesPromises = taskDirs
      .filter((dirent) => dirent.isDirectory())
      .map(async (dirent) => {
        const taskId = dirent.name;
        const originalJsonPath = path.join(
          globalStoragePath,
          taskId,
          `${StorageType.ORIGINAL}.json`,
        );
        const frontendJsonPath = path.join(
          globalStoragePath,
          taskId,
          `${StorageType.FRONT_END}.json`,
        );

        try {
          const originalContent = await fs.promises.readFile(originalJsonPath, "utf-8");
          const originalData = JSON.parse(originalContent);

          // 跳过 subTask（有 fatherTaskId 的会话）
          if (originalData.fatherTaskId) {
            return null;
          }

          const frontendContent = await fs.promises.readFile(frontendJsonPath, "utf-8");
          const frontendData = JSON.parse(frontendContent);

          // 从第一条用户消息中提取标题
          const firstUserMessage = frontendData.messages?.find(
            (msg: any) => msg.type === "userSendMessage",
          );
          const title = firstUserMessage?.data?.message?.substring(0, 50) || "未命名对话";
          const updatedAt =
            frontendData.updatedAt || originalData.updatedAt || new Date().toISOString();

          return { taskId, title, updatedAt };
        } catch (error) {
          // 如果读取失败，返回 null
          return null;
        }
      });

    const results = await Promise.all(sessionHistoriesPromises);
    const sessionHistories = results
      .filter((item): item is { taskId: string; title: string; updatedAt: string } => item !== null)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    // 发送会话历史列表
    manager.emitMessage({
      type: "sessionHistories",
      data: {
        sessionHistories,
      },
    });

    logger.info(`[sendSessionHistories] Sent ${sessionHistories.length} session histories`);
  } catch (error: any) {
    logger.error(`[sendSessionHistories] Error:`, error);
  }
};

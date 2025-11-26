import fs from "node:fs";
import path from "node:path";
import { StorageType } from "@amigo/types";
import { getGlobalState } from "@/globalState";
import { logger } from "./logger";

/**
 * 获取会话历史
 * @returns 会话历史（按时间倒序排列，不包含 subTask）
 */
export const getSessionHistories = async () => {
  const globalStoragePath = getGlobalState("globalStoragePath");
  if (!globalStoragePath) {
    logger.warn("globalStoragePath is not set.");
    return [];
  }

  const sessionHistories: { taskId: string; title: string; updatedAt: string }[] = [];
  try {
    const taskIds = await fs.promises.readdir(globalStoragePath, { withFileTypes: true });
    for (const dirent of taskIds) {
      if (dirent.isDirectory()) {
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
          // 读取 original.json 检查是否是 subTask
          const originalContent = await fs.promises.readFile(originalJsonPath, "utf-8");
          const originalData = JSON.parse(originalContent);
          
          // 跳过 subTask（有 fatherTaskId 的会话）
          if (originalData.fatherTaskId) {
            continue;
          }

          // 读取 frontend.json 获取标题和时间
          const frontendContent = await fs.promises.readFile(frontendJsonPath, "utf-8");
          const frontendData = JSON.parse(frontendContent);
          const firstUserMessage = frontendData.messages?.find(
            (msg: any) => msg.type === "userSendMessage",
          );
          if (firstUserMessage) {
            sessionHistories.push({
              taskId,
              title: firstUserMessage.data.message,
              updatedAt: frontendData.updatedAt || originalData.updatedAt || new Date().toISOString(),
            });
          }
        } catch (error) {
          logger.error(`Error reading or parsing messages for taskId ${taskId}:`, error);
        }
      }
    }
  } catch (error) {
    logger.error("Error reading globalStoragePath:", error);
  }
  
  // 按时间倒序排列（最新的在前面）
  sessionHistories.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  
  return sessionHistories;
};

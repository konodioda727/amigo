import fs from "node:fs";
import path from "node:path";
import { StorageType, type TaskStatusMetadata } from "@amigo-llm/types";
import { getStorageRootPath } from "@/core/storage";
import { logger } from "./logger";

/**
 * 获取会话历史
 * @returns 会话历史（按时间倒序排列，不包含 subTask）
 */
export const getSessionHistories = async () => {
  const storageRoot = getStorageRootPath();
  const sessionHistories: { taskId: string; title: string; updatedAt: string }[] = [];
  try {
    const taskIds = await fs.promises.readdir(storageRoot, { withFileTypes: true });
    for (const dirent of taskIds) {
      if (dirent.isDirectory()) {
        const taskId = dirent.name;
        const taskStatusJsonPath = path.join(
          storageRoot,
          taskId,
          `${StorageType.TASK_STATUS}.json`,
        );
        const frontendJsonPath = path.join(
          storageRoot,
          taskId,
          "messages",
          `${StorageType.FRONT_END}.json`,
        );

        let taskStatusData: Partial<TaskStatusMetadata> = {};
        try {
          // 读取 taskStatus.json 检查是否是 subTask
          const taskStatusContent = await fs.promises.readFile(taskStatusJsonPath, "utf-8");
          taskStatusData = JSON.parse(taskStatusContent) as Partial<TaskStatusMetadata>;

          // 跳过 subTask（有 fatherTaskId 的会话）
          if (taskStatusData.fatherTaskId) {
            continue;
          }

          // 跳过 automation 触发的主会话，避免混入用户历史记录
          if (
            taskStatusData.context &&
            typeof taskStatusData.context === "object" &&
            "trigger" in taskStatusData.context &&
            taskStatusData.context.trigger === "automation"
          ) {
            continue;
          }
        } catch (_error) {
          // 如果 taskStatus.json 不存在，可能是旧任务，继续处理
          logger.warn(`taskStatus.json not found for taskId ${taskId}, skipping subTask check.`);
        }

        try {
          // 读取 frontend.json 获取标题和时间
          const frontendContent = await fs.promises.readFile(frontendJsonPath, "utf-8");
          const frontendData = JSON.parse(frontendContent) as {
            updatedAt?: string;
            messages?: Array<{
              type?: string;
              data?: {
                message?: string;
                attachments?: Array<{ name?: string }>;
              };
            }>;
          };
          const firstUserMessage = frontendData.messages?.find(
            (msg) => msg.type === "userSendMessage",
          );
          if (firstUserMessage) {
            const attachments = firstUserMessage.data?.attachments || [];
            const fallbackTitle =
              attachments.length > 0 ? `[附件] ${attachments[0].name || "未命名文件"}` : "";
            sessionHistories.push({
              taskId,
              title: firstUserMessage.data?.message || fallbackTitle || `Task ${taskId}`,
              updatedAt:
                frontendData.updatedAt || taskStatusData.updatedAt || new Date().toISOString(),
            });
          }
        } catch (error) {
          logger.error(`Error reading or parsing messages for taskId ${taskId}:`, error);
        }
      }
    }
  } catch (error) {
    logger.error("Error reading storage root:", error);
  }

  // 按时间倒序排列（最新的在前面）
  sessionHistories.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return sessionHistories;
};

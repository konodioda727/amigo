import fs from "node:fs";
import path from "node:path";
import { StorageType } from "@amigo/types";
import { getGlobalState } from "@/globalState";

/**
 * 获取会话历史
 * @returns 会话历史
 */
export const getSessionHistories = async () => {
  const globalStoragePath = getGlobalState("globalStoragePath");
  if (!globalStoragePath) {
    console.warn("globalStoragePath is not set.");
    return [];
  }

  const sessionHistories: { taskId: string; title: string }[] = [];
  try {
    const taskIds = await fs.promises.readdir(globalStoragePath, { withFileTypes: true });
    for (const dirent of taskIds) {
      if (dirent.isDirectory()) {
        const taskId = dirent.name;
        const frontendJsonPath = path.join(
          globalStoragePath,
          taskId,
          `${StorageType.FRONT_END}.json`,
        );
        try {
          const content = await fs.promises.readFile(frontendJsonPath, "utf-8");
          const data = JSON.parse(content);
          const firstUserMessage = data.messages?.find(
            (msg: any) => msg.type === "userSendMessage",
          );
          if (firstUserMessage) {
            sessionHistories.push({ taskId, title: firstUserMessage.data.message });
          }
        } catch (error) {
          console.error(`Error reading or parsing frontend messages for taskId ${taskId}:`, error);
        }
      }
    }
  } catch (error) {
    console.error("Error reading globalStoragePath:", error);
  }
  return sessionHistories;
};

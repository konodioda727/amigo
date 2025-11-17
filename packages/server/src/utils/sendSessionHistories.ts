import fs from "fs";
import path from "path";
import { getGlobalState } from "@/globalState";
import type { ConversationManager } from "@/core/conversationManager";
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
    
    const sessionHistories = await Promise.all(
      taskDirs
        .filter(dirent => dirent.isDirectory())
        .map(async (dirent) => {
          const taskId = dirent.name;
          const originalJsonPath = path.join(globalStoragePath, taskId, 'original.json');
          
          try {
            const content = await fs.promises.readFile(originalJsonPath, 'utf-8');
            const data = JSON.parse(content);
            
            // 从第一条用户消息中提取标题
            const firstUserMessage = data.messages?.find((msg: any) => msg.type === 'userSendMessage');
            const title = firstUserMessage?.data?.message?.substring(0, 50) || '未命名对话';
            
            return { taskId, title };
          } catch (error) {
            // 如果读取失败，返回默认标题
            return { taskId, title: '未命名对话' };
          }
        })
    );

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

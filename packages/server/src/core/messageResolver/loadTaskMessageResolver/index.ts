import type { USER_SEND_MESSAGE_NAME } from "@amigo-llm/types";
import { changeCurrentTaskId } from "@/utils/changeCurrentTaskId";
import { logger } from "@/utils/logger";
import BaseMessageResolver from "../base";

export class LoadTaskMessageResolver extends BaseMessageResolver<"loadTask"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "loadTask";
  async process({ taskId }: { taskId: string }) {
    logger.info(`[LoadTaskMessageResolver] 加载任务: ${taskId}`);

    // 发送历史消息给前端
    await changeCurrentTaskId(taskId, this.manager);

    // 切换当前 manager 的 memory 到指定任务
    const success = this.manager.loadMemories(taskId);

    if (success) {
      // 如果任务被中断，可以提示用户
      if (this.manager.conversationStatus === "aborted") {
        logger.info(`[LoadTaskMessageResolver] 任务 ${taskId} 处于中断状态，可以使用 resume 恢复`);
      }
    } else {
      logger.warn(`[LoadTaskMessageResolver] 切换到任务 ${taskId} 失败`);
    }
  }
}

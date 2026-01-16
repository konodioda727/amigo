import type { USER_SEND_MESSAGE_NAME } from "@amigo-llm/types";
import { broadcaster, conversationRepository } from "@/core/conversation";
import { changeCurrentTaskId } from "@/utils/changeCurrentTaskId";
import { logger } from "@/utils/logger";
import BaseMessageResolver from "../base";

export class LoadTaskMessageResolver extends BaseMessageResolver<"loadTask"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "loadTask";

  async process({ taskId }: { taskId: string }) {
    logger.info(`[LoadTaskMessageResolver] 加载任务: ${taskId}`);

    // 发送历史消息给前端
    await changeCurrentTaskId(taskId, this.conversation, broadcaster);

    // 加载目标会话
    const targetConversation = conversationRepository.getOrLoad(taskId);

    if (targetConversation.status === "aborted") {
      logger.info(`[LoadTaskMessageResolver] 任务 ${taskId} 处于中断状态，可以使用 resume 恢复`);
    }
  }
}

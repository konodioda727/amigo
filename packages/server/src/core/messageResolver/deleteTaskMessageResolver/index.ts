import type { UserSendMessageData } from "@amigo-llm/types";
import { logger } from "@/utils/logger";
import type { Conversation } from "../../conversation/Conversation";
import { conversationRepository } from "../../conversation/ConversationRepository";
import { broadcaster } from "../../conversation/WebSocketBroadcaster";
import BaseMessageResolver from "../base";

/**
 * 删除任务消息解析器
 */
export class DeleteTaskMessageResolver extends BaseMessageResolver<"deleteTask"> {
  static resolverName = "deleteTask" as const;

  constructor(conversation: Conversation) {
    super(conversation);
  }

  async process(data: UserSendMessageData<"deleteTask">): Promise<void> {
    const { taskId } = data;

    logger.info(`[DeleteTaskMessageResolver] 开始删除任务: ${taskId}`);

    try {
      // 递归删除任务及其所有子任务
      const deletedIds = await conversationRepository.deleteWithChildren(taskId);

      logger.info(`[DeleteTaskMessageResolver] 成功删除任务及其子任务: ${deletedIds.join(", ")}`);

      // 向客户端发送删除成功消息
      broadcaster.broadcast(taskId, {
        type: "taskDeleted",
        data: {
          taskId,
          deletedSubTaskIds: deletedIds.filter((id) => id !== taskId),
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[DeleteTaskMessageResolver] 删除任务失败: ${errorMessage}`);

      // 发送错误消息
      broadcaster.broadcast(taskId, {
        type: "error",
        data: {
          message: "删除任务失败",
          details: errorMessage,
        },
      });
    }
  }
}

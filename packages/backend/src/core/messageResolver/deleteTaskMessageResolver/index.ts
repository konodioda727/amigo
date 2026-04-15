import type { UserSendMessageData } from "@amigo-llm/types";
import { logger } from "@/utils/logger";
import { conversationRepository } from "../../conversation/ConversationRepository";
import { broadcaster } from "../../conversation/lifecycle/WebSocketBroadcaster";
import BaseMessageResolver from "../base";

/**
 * 删除任务消息解析器
 */
export class DeleteTaskMessageResolver extends BaseMessageResolver<"deleteTask"> {
  static override resolverName = "deleteTask" as const;

  override async process(data: UserSendMessageData<"deleteTask">): Promise<void> {
    const { taskId } = data;

    logger.info(`[DeleteTaskMessageResolver] 开始删除任务: ${taskId}`);

    try {
      // 递归删除任务及其所有子会话
      const deletedIds = await conversationRepository.deleteWithChildren(taskId);

      logger.info(`[DeleteTaskMessageResolver] 成功删除任务及其子会话: ${deletedIds.join(", ")}`);

      // 向客户端发送删除成功消息
      broadcaster.broadcast(taskId, {
        type: "taskDeleted",
        data: {
          taskId,
          deletedChildTaskIds: deletedIds.filter((id) => id !== taskId),
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

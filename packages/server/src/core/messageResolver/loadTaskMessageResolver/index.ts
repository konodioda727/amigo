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

    // 如果会话正在等待工具确认，重新发送 waiting_tool_call 消息
    if (
      this.conversation.status === "waiting_tool_confirmation" &&
      this.conversation.pendingToolCall
    ) {
      logger.info(
        `[LoadTaskMessageResolver] 任务 ${taskId} 正在等待工具确认，重新发送 waiting_tool_call 消息`,
      );

      broadcaster.broadcast(taskId, {
        type: "waiting_tool_call",
        data: {
          taskId,
          toolName: this.conversation.pendingToolCall.toolName,
          params: this.conversation.pendingToolCall.params,
        },
      });
    }

    if (this.conversation.status === "aborted") {
      logger.info(`[LoadTaskMessageResolver] 任务 ${taskId} 处于中断状态，可以使用 resume 恢复`);
    }
  }
}

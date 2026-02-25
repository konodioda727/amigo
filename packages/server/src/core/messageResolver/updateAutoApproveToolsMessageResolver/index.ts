import type { USER_SEND_MESSAGE_NAME, UserSendMessageData } from "@amigo-llm/types";
import { broadcaster } from "@/core/conversation";
import { logger } from "@/utils/logger";
import BaseMessageResolver from "../base";

export class UpdateAutoApproveToolsMessageResolver extends BaseMessageResolver<"updateAutoApproveTools"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "updateAutoApproveTools";

  override async process(message: UserSendMessageData<"updateAutoApproveTools">): Promise<void> {
    const { taskId, toolNames } = message;

    if (taskId !== this.conversation.id) {
      logger.warn(
        `[UpdateAutoApproveToolsMessageResolver] taskId mismatch: message=${taskId}, conversation=${this.conversation.id}`,
      );
    }

    try {
      this.conversation.setAutoApproveToolNames(toolNames);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `[UpdateAutoApproveToolsMessageResolver] 更新 autoApprove 工具失败: ${errorMessage}`,
      );
      broadcaster.broadcast(taskId, {
        type: "error",
        data: {
          message: "更新自动批准工具失败",
          details: errorMessage,
        },
      });
    }
  }
}

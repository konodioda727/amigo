import type { USER_SEND_MESSAGE_NAME } from "@amigo-llm/types";
import { conversationOrchestrator } from "@/core/conversation";
import { logger } from "@/utils/logger";
import BaseMessageResolver from "./base";

export class RejectMessageResolver extends BaseMessageResolver<"reject"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "reject";

  override async process(_message: { taskId: string }): Promise<void> {
    // 不使用 setUserInput，因为 "reject" 不应该被添加到 memory
    // 只设置 userInput 作为控制信号
    this.conversation.userInput = "reject";
    this.conversation.isAborted = false;

    if (this.conversation.status === "waiting_tool_confirmation") {
      if (this.conversation.pendingToolCall) {
        logger.info(
          `[RejectMessageResolver] 拒绝执行待确认工具: ${this.conversation.pendingToolCall.toolName}`,
        );
        const executor = conversationOrchestrator.getExecutor(this.conversation.id);
        await executor.execute(this.conversation);
      } else {
        logger.warn(
          "[RejectMessageResolver] 会话状态为 waiting_tool_confirmation 但 pendingToolCall 为空",
        );
      }
    } else {
      logger.warn(
        `[RejectMessageResolver] 会话状态不是 waiting_tool_confirmation，当前状态: ${this.conversation.status}`,
      );
    }
  }
}

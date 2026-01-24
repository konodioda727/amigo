import type { USER_SEND_MESSAGE_NAME } from "@amigo-llm/types";
import { taskOrchestrator } from "@/core/conversation";
import { logger } from "@/utils/logger";
import BaseMessageResolver from "./base";

export class ConfirmMessageResolver extends BaseMessageResolver<"confirm"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "confirm";

  override async process(_message: { taskId: string }): Promise<void> {
    // 不使用 setUserInput，因为 "confirm" 不应该被添加到 memory
    // 只设置 userInput 作为控制信号
    this.conversation.userInput = "confirm";
    this.conversation.isAborted = false;

    // 如果会话状态是 waiting_tool_confirmation，执行工具
    if (this.conversation.status === "waiting_tool_confirmation") {
      if (this.conversation.pendingToolCall) {
        logger.info(
          `[ConfirmMessageResolver] 恢复执行待确认工具: ${this.conversation.pendingToolCall.toolName}`,
        );
        const executor = taskOrchestrator.getExecutor(this.conversation.id);
        await executor.execute(this.conversation);
      } else {
        logger.warn(
          "[ConfirmMessageResolver] 会话状态为 waiting_tool_confirmation 但 pendingToolCall 为空",
        );
      }
    } else {
      logger.warn(
        `[ConfirmMessageResolver] 会话状态不是 waiting_tool_confirmation，当前状态: ${this.conversation.status}`,
      );
    }
  }
}

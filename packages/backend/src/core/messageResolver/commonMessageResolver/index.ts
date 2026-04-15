import type {
  ConversationStatus,
  USER_SEND_MESSAGE_NAME,
  UserSendMessageData,
} from "@amigo-llm/types";
import { conversationOrchestrator } from "@/core/conversation";
import BaseMessageResolver from "../base";

export class CommonMessageResolver extends BaseMessageResolver<"userSendMessage"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "userSendMessage";

  override async process(message: UserSendMessageData<"userSendMessage">): Promise<void> {
    await conversationOrchestrator.setUserInput(
      this.conversation,
      message.message,
      message.attachments,
      message.workflowMode,
    );
    const executor = conversationOrchestrator.getExecutor(this.conversation.id);
    const manualExecuteStatus: ConversationStatus[] = [
      "completed",
      "aborted",
      "idle",
      "error",
      "waiting_tool_confirmation",
    ];
    const shouldRecoverStaleActiveExecution =
      ["streaming", "tool_executing"].includes(this.conversation.status) &&
      !executor.getCurrentAbortController();
    // 启动执行（如果还没有在执行）
    if (
      manualExecuteStatus.includes(this.conversation.status) ||
      shouldRecoverStaleActiveExecution
    ) {
      executor.execute(this.conversation);
    }
  }
}

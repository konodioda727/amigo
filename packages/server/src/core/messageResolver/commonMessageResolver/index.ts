import type {
  ConversationStatus,
  USER_SEND_MESSAGE_NAME,
  UserSendMessageData,
} from "@amigo-llm/types";
import { taskOrchestrator } from "@/core/conversation";
import BaseMessageResolver from "../base";

export class CommonMessageResolver extends BaseMessageResolver<"userSendMessage"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "userSendMessage";

  override async process(message: UserSendMessageData<"userSendMessage">): Promise<void> {
    taskOrchestrator.setUserInput(this.conversation, message.message, message.attachments);
    const manualExecuteStatus: ConversationStatus[] = [
      "completed",
      "aborted",
      "idle",
      "error",
      "waiting_tool_confirmation",
    ];
    // 启动执行（如果还没有在执行）
    if (manualExecuteStatus.includes(this.conversation.status)) {
      const executor = taskOrchestrator.getExecutor(this.conversation.id);
      executor.execute(this.conversation);
    }
  }
}

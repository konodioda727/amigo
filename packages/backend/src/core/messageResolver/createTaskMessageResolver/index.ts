import type {
  ConversationStatus,
  USER_SEND_MESSAGE_NAME,
  UserSendMessageData,
} from "@amigo-llm/types";
import { broadcaster, taskOrchestrator } from "@/core/conversation";
import { getGlobalState } from "@/globalState";
import { getSessionHistories } from "@/utils/getSessions";
import { logger } from "@/utils/logger";
import BaseMessageResolver from "../base";

export class CreateTaskMessageResolver extends BaseMessageResolver<"createTask"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "createTask";

  override async process(message: UserSendMessageData<"createTask">): Promise<void> {
    // 设置用户输入
    taskOrchestrator.setUserInput(this.conversation, message.message, message.attachments);

    const onConversationCreate = getGlobalState("onConversationCreate");
    const resolvedContext = this.conversation.memory.context ?? message.context;
    if (onConversationCreate) {
      try {
        await onConversationCreate({
          taskId: this.conversation.id,
          context: resolvedContext,
        });
      } catch (error) {
        logger.error("[CreateTaskMessageResolver] onConversationCreate 执行失败:", error);
      }
    }

    // 发送 taskCreated 消息给前端，同时带上最新的 sessionHistories
    broadcaster.broadcast(this.conversation.id, {
      type: "taskCreated",
      data: {
        taskId: this.conversation.id,
        sessionHistories: await getSessionHistories(),
      },
    });

    // 启动执行
    const manualExecuteStatus: ConversationStatus[] = ["completed", "aborted", "idle"];
    if (manualExecuteStatus.includes(this.conversation.status)) {
      const executor = taskOrchestrator.getExecutor(this.conversation.id);
      executor.execute(this.conversation);
    }
  }
}

import type { ConversationStatus, USER_SEND_MESSAGE_NAME } from "@amigo-llm/types";
import { broadcaster, taskOrchestrator } from "@/core/conversation";
import { getSessionHistories } from "@/utils/getSessions";
import BaseMessageResolver from "../base";

export class CreateTaskMessageResolver extends BaseMessageResolver<"createTask"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "createTask";

  override async process(message: { message: string }): Promise<void> {
    // 设置用户输入
    taskOrchestrator.setUserInput(this.conversation, message.message);

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

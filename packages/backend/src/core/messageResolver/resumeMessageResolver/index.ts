import type { USER_SEND_MESSAGE_NAME } from "@amigo-llm/types";
import { conversationOrchestrator } from "@/core/conversation";
import { logger } from "@/utils/logger";
import BaseMessageResolver from "../base";

export class ResumeMessageResolver extends BaseMessageResolver<"resume"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "resume";

  override async process(_message: { taskId: string }): Promise<void> {
    logger.info(`处理恢复消息`);
    conversationOrchestrator.resume(this.conversation);

    // 恢复后启动执行
    const executor = conversationOrchestrator.getExecutor(this.conversation.id);
    executor.execute(this.conversation);
  }
}

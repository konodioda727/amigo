import type { USER_SEND_MESSAGE_NAME, UserSendMessageData } from "@amigo-llm/types";
import { conversationOrchestrator } from "@/core/conversation";
import { logger } from "@/utils/logger";
import BaseMessageResolver from "../base";

export class InterruptMessageResolver extends BaseMessageResolver<"interrupt"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "interrupt";

  override async process(_message: UserSendMessageData<"interrupt">): Promise<void> {
    logger.info(`处理中断消息`);
    conversationOrchestrator.interrupt(this.conversation);
  }
}

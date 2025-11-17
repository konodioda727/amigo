import type { USER_SEND_MESSAGE_NAME } from "@amigo/types";
import BaseMessageResolver from "../base";
import { logger } from "@/utils/logger";

export class InterruptMessageResolver extends BaseMessageResolver<"interrupt"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "interrupt";
  override async process(_message: { taskId: string }): Promise<void> {
    logger.info(`处理中断消息`);
    this.manager?.interrupt();
  }
}

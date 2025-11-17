import type { USER_SEND_MESSAGE_NAME } from "@amigo/types";
import BaseMessageResolver from "../base";
import { logger } from "@/utils/logger";

export class ResumeMessageResolver extends BaseMessageResolver<"resume"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "resume";

  override async process(_message: { taskId: string }): Promise<void> {
    logger.info(`处理恢复消息`);
    // ack 消息会在 server/index.ts 中统一发送
    // 直接调用 resume 方法恢复会话
    this.manager?.resume();
  }
}

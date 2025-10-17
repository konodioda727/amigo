import type { USER_SEND_MESSAGE_NAME } from "@amigo/types";
import BaseMessageResolver from "../base";

export class InterruptMessageResolver extends BaseMessageResolver<"interrupt"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "interrupt";
  override async process(_message: { taskId: string }): Promise<void> {
    console.log(`处理中断消息`);
    this.manager?.interrupt();
  }
}

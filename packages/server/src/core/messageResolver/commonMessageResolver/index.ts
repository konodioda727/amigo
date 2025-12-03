import type { USER_SEND_MESSAGE_NAME, WebSocketMessage } from "@amigo-llm/types";
import BaseMessageResolver from "../base";

export class CommonMessageResolver extends BaseMessageResolver<"userSendMessage"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "userSendMessage";
  override async process(message: { message: string; taskId: string }): Promise<void> {
    const originalRequest: WebSocketMessage<"userSendMessage"> & { taskId: string } = {
      type: "userSendMessage",
      data: message,
      taskId: message.taskId,
    };
    this.manager?.setUserInput(originalRequest);
  }
}

import type { USER_SEND_MESSAGE_NAME, UserSendMessageData } from "@amigo-llm/types";
import type { ConversationManager } from "@/core/conversationManager";

/**
 * messageResolver 基类
 */
abstract class BaseMessageResolver<K extends USER_SEND_MESSAGE_NAME> {
  static resolverName: USER_SEND_MESSAGE_NAME = "userSendMessage";

  constructor(protected manager: ConversationManager) {}
  /**
   * 处理前端发送过来的消息
   * @param message 接受到消息
   */
  abstract process(message: UserSendMessageData<K>): Promise<void>;
}

export default BaseMessageResolver;

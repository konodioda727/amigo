import type { USER_SEND_MESSAGE_NAME, WebSocketMessage } from "@amigo/types";
import { ConversationManager } from "@/core/conversationManager";
import BaseMessageResolver from "../base";
import { logger } from "@/utils/logger";

export class CallSubTaskMessageResolver extends BaseMessageResolver<"callSubTask"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "callSubTask";
  
  override async process(message: { taskId: string; subTaskId: string; message: string }): Promise<void> {
    const { taskId, subTaskId, message: content } = message;
    
    logger.info(`[CallSubTaskMessageResolver] Sending message to subtask: ${subTaskId} from parent: ${taskId}`);
    
    // 获取或创建子任务的 ConversationManager
    let subTaskManager = ConversationManager.taskMapToConversationManager[subTaskId];
    
    if (!subTaskManager) {
      logger.info(`[CallSubTaskMessageResolver] SubTask manager not found, creating new one for: ${subTaskId}`);
      subTaskManager = new ConversationManager({ taskId: subTaskId });
    }
    
    // 向子任务发送消息
    const userMessage: WebSocketMessage<"userSendMessage"> & { taskId: string } = {
      type: "userSendMessage",
      data: {
        message: content,
        taskId: subTaskId,
      },
      taskId: subTaskId,
    };
    
    subTaskManager.setUserInput(userMessage);
    
    logger.info(`[CallSubTaskMessageResolver] Message sent to subtask: ${subTaskId}`);
  }
}

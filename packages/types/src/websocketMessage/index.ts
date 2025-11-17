import type { SERVER_SEND_MESSAGE_NAME, ServerSendMessageData } from "./serverSend";
import type { USER_SEND_MESSAGE_NAME, UserSendMessageData } from "./userSend";

/**
 * 系统保留标签
 * 用于标识特殊的系统消息类型
 */
export type SYSTEM_RESERVED_TAGS = "completionResult" | "think" | 'interrupt' | 'askFollowupQuestion' | 'system';
export const systemReservedTags: SYSTEM_RESERVED_TAGS[] = ["completionResult", "think", 'interrupt', 'askFollowupQuestion'];
/**
 * 核心消息类型定义
 * 适配OpenAI API格式，仅包含 role 和 content
 */
export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  type: USER_SEND_MESSAGE_NAME | SERVER_SEND_MESSAGE_NAME | SYSTEM_RESERVED_TAGS;
  partial?: boolean;
  updateTime?: number;
};

/**
 * 前端展示用消息类型
 * 增加了 id 和完成状态
 */
export type WebSocketMessage<K extends USER_SEND_MESSAGE_NAME | SERVER_SEND_MESSAGE_NAME> = {
  type: K extends any ? USER_SEND_MESSAGE_NAME | SERVER_SEND_MESSAGE_NAME : K;
  data: (K extends SERVER_SEND_MESSAGE_NAME
    ? ServerSendMessageData<K>
    : K extends USER_SEND_MESSAGE_NAME
      ? UserSendMessageData<K>
      : K extends any
        ? ServerSendMessageData<SERVER_SEND_MESSAGE_NAME> &
            UserSendMessageData<USER_SEND_MESSAGE_NAME>
        : never) & {
    updateTime?: number;
    partial?: boolean;
    status?: "pending" | "acked" | "failed";
  };
};

export * from "./serverSend";
export * from "./userSend";

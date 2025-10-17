import type { SERVER_SEND_MESSAGE_NAME, WebSocketMessage } from "@amigo/types";

/**
 * message 接收函数类型
 */
export type MessageResolvers<T extends SERVER_SEND_MESSAGE_NAME> = (props: {
  newMessage: WebSocketMessage<T>;
  currentMessagesRef: React.MutableRefObject<WebSocketMessage<any>[]>;
  setMessages: React.Dispatch<React.SetStateAction<WebSocketMessage<any>[]>>;
}) => void;

export interface MessageType<T extends WebSocketMessage<any>["type"]> {
  type: T;
  updateTime: number;
}

/**
 * 普通消息类型
 */
export interface FrontendCommonMessageType extends MessageType<"message"> {
  message: string;
  think?: string;
}

/**
 * 工具调用消息类型
 */
export interface FrontendToolMessageType extends MessageType<"tool"> {
  toolName: string;
  params: Record<string, any>;
  toolOutput?: string;
  error?: string;
}

/**
 * followup 问题类型
 */
export interface AskFollowupQuestionType extends MessageType<"askFollowupQuestion"> {
  question: string;
  sugestions: string[];
}

/**
 * completion 结果类型
 */
export interface CompletionResultType extends MessageType<"completionResult"> {
  result: string;
}

/**
 * 展示消息类型
 */
export interface UserSendMessageDisplayType {
  message: string;
  updateTime: number;
  status?: "pending" | "acked" | "failed";
  type: "userSendMessage";
}

export type DisplayMessageType =
  | FrontendCommonMessageType
  | CompletionResultType
  | FrontendToolMessageType
  | AskFollowupQuestionType
  | UserSendMessageDisplayType;

/**
 * 展示消息类型名称
 */
export const DisplayMessageTypeNames: WebSocketMessage<any>["type"][]= [
  "message",
  "completionResult",
  "tool",
  "askFollowupQuestion",
];

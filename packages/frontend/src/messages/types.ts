import type { SERVER_SEND_MESSAGE_NAME, ToolNames, ToolParam, ToolParams, ToolResult, WebSocketMessage } from "@amigo/types";

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
export interface FrontendToolMessageType<T extends ToolNames> extends MessageType<"tool"> {
  toolName: T;
  params: ToolParams<T>;
  toolOutput?: ToolResult<T>;
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

export interface AssignTaskUpdatedDisplayType extends MessageType<"assignTaskUpdated"> {
  index: number;
  taskId: string;
  parentTaskId?: string;
}

export type DisplayMessageType =
  | FrontendCommonMessageType
  | CompletionResultType
  | FrontendToolMessageType<any>
  | AskFollowupQuestionType
  | UserSendMessageDisplayType
  | AssignTaskUpdatedDisplayType;

/**
 * 展示消息类型名称
 */
export const DisplayMessageTypeNames: WebSocketMessage<any>["type"][]= [
  "message",
  "completionResult",
  "tool",
  "askFollowupQuestion",
];

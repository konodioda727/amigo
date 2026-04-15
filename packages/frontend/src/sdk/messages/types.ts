import type {
  SERVER_SEND_MESSAGE_NAME,
  ToolNames,
  ToolParams,
  ToolResult,
  UserMessageAttachment,
  WebSocketMessage,
  WorkflowPhase,
} from "@amigo-llm/types";

/**
 * message 接收函数类型
 */
export type MessageResolvers<T extends SERVER_SEND_MESSAGE_NAME> = (props: {
  newMessage: WebSocketMessage<T>;
  currentMessagesRef: React.MutableRefObject<WebSocketMessage<any>[]>;
  setMessages: React.Dispatch<React.SetStateAction<WebSocketMessage<any>[]>>;
}) => void;

export interface MessageType<T extends string> {
  type: T;
  updateTime: number;
}

/**
 * 普通消息类型
 */
export interface FrontendCommonMessageType extends MessageType<"message"> {
  message: string;
}

/**
 * 思考消息类型
 */
export interface FrontendThinkMessageType extends MessageType<"think"> {
  think: string;
  partial?: boolean;
}

/**
 * 工具调用消息类型
 */
export interface FrontendToolMessageType<T extends ToolNames> extends MessageType<"tool"> {
  toolName: T;
  params: ToolParams<T>;
  toolOutput?: ToolResult<T>;
  websocketData?: unknown;
  toolCallId?: string;
  sourceUpdateTime?: number;
  workflowPhase?: WorkflowPhase;
  error?: string;
  hasError?: boolean;
  partial?: boolean;
}

/**
 * followup 问题类型
 */
export interface AskFollowupQuestionType extends MessageType<"askFollowupQuestion"> {
  question: string;
  sugestions: string[];
  /** 是否禁用（非最新消息时禁用） */
  disabled?: boolean;
  /** 用户已选择的选项（如果下一条用户消息匹配选项） */
  selectedOption?: string;
}

/**
 * 展示消息类型
 */
export interface UserSendMessageDisplayType {
  message: string;
  attachments?: UserMessageAttachment[];
  updateTime: number;
  status?: "pending" | "acked" | "failed";
  type: "userSendMessage";
}

export interface InterruptDisplayType extends MessageType<"interrupt"> {}

export interface ErrorDisplayType extends MessageType<"error"> {
  message: string;
}

export interface AlertDisplayType extends MessageType<"alert"> {
  data: {
    message: string;
    severity: "info" | "warning" | "error" | "success";
    toastOnly?: boolean;
  };
}

export interface ReadSummaryDisplayType extends MessageType<"readSummary"> {
  text: string;
  fileCount: number;
  searchCount: number;
  resourceCount: number;
  toolCount: number;
  files: string[];
  searches: string[];
  resources: string[];
}

export type DisplayMessageType =
  | FrontendCommonMessageType
  | FrontendThinkMessageType
  | FrontendToolMessageType<any>
  | AskFollowupQuestionType
  | UserSendMessageDisplayType
  | InterruptDisplayType
  | ErrorDisplayType
  | AlertDisplayType
  | ReadSummaryDisplayType;

/**
 * 展示消息类型名称
 */
export const DisplayMessageTypeNames: WebSocketMessage<any>["type"][] = [
  "message",
  "think",
  "tool",
  "askFollowupQuestion",
  "error",
];

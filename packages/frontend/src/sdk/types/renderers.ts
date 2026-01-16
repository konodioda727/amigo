import type { ToolNames } from "@amigo-llm/types";
import type { ReactNode } from "react";
import type {
  AlertDisplayType,
  AskFollowupQuestionType,
  AssignTaskUpdatedDisplayType,
  CompletionResultType,
  DisplayMessageType,
  ErrorDisplayType,
  FrontendCommonMessageType,
  FrontendToolMessageType,
  InterruptDisplayType,
  UserSendMessageDisplayType,
} from "../messages/types";

/**
 * Base renderer props for each message type
 */
export interface MessageRendererProps<T extends DisplayMessageType> {
  message: T;
  isLatest: boolean;
}

/**
 * Specific renderer prop types
 */
export type CommonMessageRendererProps = MessageRendererProps<FrontendCommonMessageType>;
export type ToolMessageRendererProps<T extends ToolNames> = MessageRendererProps<
  FrontendToolMessageType<T>
>;
export type UserMessageRendererProps = MessageRendererProps<UserSendMessageDisplayType>;
export type CompletionResultRendererProps = MessageRendererProps<CompletionResultType>;
export type AskFollowupQuestionRendererProps = MessageRendererProps<AskFollowupQuestionType>;
export type InterruptRendererProps = MessageRendererProps<InterruptDisplayType>;
export type ErrorRendererProps = MessageRendererProps<ErrorDisplayType>;
export type AlertRendererProps = MessageRendererProps<AlertDisplayType>;
export type AssignTaskUpdatedRendererProps = MessageRendererProps<AssignTaskUpdatedDisplayType>;

/**
 * Renderer function type
 */
export type MessageRenderer<T extends DisplayMessageType> = (
  props: MessageRendererProps<T>,
) => ReactNode;

/**
 * Complete renderer map
 */
export interface MessageRendererMap {
  message: MessageRenderer<FrontendCommonMessageType>;
  tool: MessageRenderer<FrontendToolMessageType<ToolNames>>;
  userSendMessage: MessageRenderer<UserSendMessageDisplayType>;
  completionResult: MessageRenderer<CompletionResultType>;
  askFollowupQuestion: MessageRenderer<AskFollowupQuestionType>;
  interrupt: MessageRenderer<InterruptDisplayType>;
  error: MessageRenderer<ErrorDisplayType>;
  alert: MessageRenderer<AlertDisplayType>;
  assignTaskUpdated: MessageRenderer<AssignTaskUpdatedDisplayType>;
}

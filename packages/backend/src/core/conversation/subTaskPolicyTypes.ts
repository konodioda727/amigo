import type { ChatMessage, ToolParamDefinition } from "@amigo-llm/types";

export type SubTaskPolicyPayload = Record<string, unknown> | null;

export type SubTaskValidationResult = {
  ok: boolean;
  reason?: string;
  details: string[];
};

export type SubTaskWaitReviewEvaluationResult = {
  action: "approve" | "request_changes" | "defer";
  message?: string;
  feedback?: string;
};

export type SubTaskCompletionValidationHookPayload = {
  payload: SubTaskPolicyPayload;
  messages: ChatMessage[];
  toolNames: string[];
  taskDescription?: string;
  subTaskId?: string;
  parentTaskId?: string;
  context?: unknown;
};

export type SubTaskWaitReviewEvaluationHookPayload = {
  subTaskId: string;
  pendingPayload: SubTaskPolicyPayload;
  taskDescription?: string;
  parentTaskId: string;
  parentMessages: ChatMessage[];
  subTaskMessages: ChatMessage[];
  toolNames: string[];
  context?: unknown;
};

export type ToolParamExtensionsConfig = Partial<
  Record<"main" | "sub", Partial<Record<string, ToolParamDefinition<string>[]>>>
>;

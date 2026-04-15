import type { ChatMessage, ToolParamDefinition } from "@amigo-llm/types";
import type { WorkflowPromptScope } from "../../workflow";

export type TaskExecutionPayload = Record<string, unknown> | null;

export type TaskExecutionValidationResult = {
  ok: boolean;
  reason?: string;
  details: string[];
};

export type TaskExecutionVerificationResult = {
  action: "approve" | "request_changes" | "defer";
  message?: string;
  feedback?: string;
};

export type TaskExecutionCompletionValidationHookPayload = {
  payload: TaskExecutionPayload;
  messages: ChatMessage[];
  toolNames: string[];
  taskDescription?: string;
  executionTaskId?: string;
  parentTaskId?: string;
  context?: unknown;
};

export type TaskExecutionVerificationHookPayload = {
  executionTaskId: string;
  pendingPayload: TaskExecutionPayload;
  taskDescription?: string;
  parentTaskId: string;
  parentMessages: ChatMessage[];
  executionTaskMessages: ChatMessage[];
  toolNames: string[];
  context?: unknown;
};

export type ToolParamExtensionsConfig = Partial<
  Record<WorkflowPromptScope, Partial<Record<string, ToolParamDefinition<string>[]>>>
>;

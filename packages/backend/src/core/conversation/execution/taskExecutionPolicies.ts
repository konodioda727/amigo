import type { ChatMessage } from "@amigo-llm/types";
import { getGlobalState } from "@/globalState";
import type {
  TaskExecutionCompletionValidationHookPayload,
  TaskExecutionValidationResult,
  TaskExecutionVerificationHookPayload,
  TaskExecutionVerificationResult,
} from "./taskExecutionPolicyTypes";
import {
  type CompletedExecutionTaskPayload,
  validateCompletedExecutionTaskPayload,
} from "./taskExecutionResult";

const mergeValidationResults = (
  base: TaskExecutionValidationResult,
  extra?: TaskExecutionValidationResult | null,
): TaskExecutionValidationResult => {
  if (!extra) {
    return base;
  }
  const details = [...base.details, ...extra.details];
  if (details.length === 0) {
    return { ok: true, details: [] };
  }
  return {
    ok: false,
    reason: base.reason || extra.reason || details[0],
    details,
  };
};

export const runTaskExecutionCompletionValidation = async ({
  payload,
  messages,
  toolNames,
  taskDescription,
  executionTaskId,
  parentTaskId,
  context,
}: {
  payload: CompletedExecutionTaskPayload | null;
  messages: ChatMessage[];
  toolNames: string[];
  taskDescription?: string;
  executionTaskId?: string;
  parentTaskId?: string;
  context?: unknown;
}): Promise<TaskExecutionValidationResult> => {
  const baseValidation = validateCompletedExecutionTaskPayload(payload);
  const extraValidator = getGlobalState("taskExecutionCompletionValidator");
  if (!extraValidator) {
    return baseValidation;
  }
  const extraValidation = await extraValidator({
    payload: (payload as Record<string, unknown> | null) ?? null,
    messages,
    toolNames,
    taskDescription,
    executionTaskId,
    parentTaskId,
    context,
  } satisfies TaskExecutionCompletionValidationHookPayload);
  return mergeValidationResults(baseValidation, extraValidation);
};

export const runTaskExecutionVerification = async (
  payload: TaskExecutionVerificationHookPayload,
): Promise<TaskExecutionVerificationResult> => {
  const evaluator = getGlobalState("taskExecutionVerificationEvaluator");
  if (!evaluator) {
    return { action: "defer" };
  }
  return evaluator(payload);
};

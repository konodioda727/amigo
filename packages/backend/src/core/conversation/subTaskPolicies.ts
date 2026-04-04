import type { ChatMessage } from "@amigo-llm/types";
import { getGlobalState } from "@/globalState";
import type {
  SubTaskCompletionValidationHookPayload,
  SubTaskValidationResult,
  SubTaskWaitReviewEvaluationHookPayload,
  SubTaskWaitReviewEvaluationResult,
} from "./subTaskPolicyTypes";
import { type CompletedSubTaskPayload, validateCompletedSubTaskPayload } from "./subTaskResult";

const mergeValidationResults = (
  base: SubTaskValidationResult,
  extra?: SubTaskValidationResult | null,
): SubTaskValidationResult => {
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

export const runSubTaskCompletionValidation = async ({
  payload,
  messages,
  toolNames,
  taskDescription,
  subTaskId,
  parentTaskId,
  context,
}: {
  payload: CompletedSubTaskPayload | null;
  messages: ChatMessage[];
  toolNames: string[];
  taskDescription?: string;
  subTaskId?: string;
  parentTaskId?: string;
  context?: unknown;
}): Promise<SubTaskValidationResult> => {
  const baseValidation = validateCompletedSubTaskPayload(payload);
  const extraValidator = getGlobalState("subTaskCompletionValidator");
  if (!extraValidator) {
    return baseValidation;
  }
  const extraValidation = await extraValidator({
    payload: (payload as Record<string, unknown> | null) ?? null,
    messages,
    toolNames,
    taskDescription,
    subTaskId,
    parentTaskId,
    context,
  } satisfies SubTaskCompletionValidationHookPayload);
  return mergeValidationResults(baseValidation, extraValidation);
};

export const runSubTaskWaitReviewEvaluation = async (
  payload: SubTaskWaitReviewEvaluationHookPayload,
): Promise<SubTaskWaitReviewEvaluationResult> => {
  const evaluator = getGlobalState("subTaskWaitReviewEvaluator");
  if (!evaluator) {
    return { action: "defer" };
  }
  return evaluator(payload);
};

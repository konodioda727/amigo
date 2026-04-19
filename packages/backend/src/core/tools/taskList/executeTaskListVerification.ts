import { conversationRepository, runTaskExecutionVerification } from "@/core/conversation";
import {
  extractCompletedExecutionTaskPayload,
  formatCompletedExecutionTaskPayload,
  validateCompletedExecutionTaskPayload,
} from "@/core/conversation/execution/taskExecutionResult";
import { applyTaskExecutionReview } from "../reviewTaskExecution";
import type {
  GenericTool,
  ParentConversation,
  TaskVerificationResult,
} from "./executeTaskListShared";
import { MAX_INTERNAL_REVIEW_ROUNDS } from "./executeTaskListShared";

const resolveInternalReviewFeedback = (message?: string, feedback?: string) =>
  [feedback?.trim(), message?.trim()].find(Boolean);

const shouldBypassInternalReview = (action: "approve" | "request_changes" | "defer"): boolean =>
  action === "defer";

const resolveCompletedExecutionTaskSummary = (
  conversation: ReturnType<typeof conversationRepository.load>,
  fallback: string,
) => {
  const payload = conversation ? extractCompletedExecutionTaskPayload(conversation) : null;
  return payload ? formatCompletedExecutionTaskPayload(payload) : fallback;
};

export const handleInternalVerification = async ({
  parentConv,
  executionTaskId,
  cleanDescriptionForAgent,
  availableTools,
}: {
  parentConv: ParentConversation;
  executionTaskId: string;
  cleanDescriptionForAgent: string;
  availableTools: GenericTool[];
}): Promise<TaskVerificationResult> => {
  for (let round = 0; round < MAX_INTERNAL_REVIEW_ROUNDS; round += 1) {
    const subConversation = conversationRepository.load(executionTaskId);
    if (!subConversation) {
      return {
        outcome: "failed",
        summary: `未找到子任务 ${executionTaskId} 的执行会话。`,
        taskSucceeded: false,
        validationReason: `未找到子任务 ${executionTaskId} 的执行会话。`,
      };
    }

    const completedPayload = extractCompletedExecutionTaskPayload(subConversation);
    if (!completedPayload) {
      return {
        outcome: "failed",
        summary: "子任务缺少可审阅的 finishPhase 结果。",
        taskSucceeded: false,
        validationReason: "子任务缺少可审阅的 finishPhase 结果。",
      };
    }

    const evaluation = await runTaskExecutionVerification({
      executionTaskId,
      pendingPayload: completedPayload,
      taskDescription: cleanDescriptionForAgent,
      parentTaskId: parentConv.id,
      parentMessages: parentConv.memory.messages,
      executionTaskMessages: subConversation.memory.messages,
      toolNames: availableTools.map((tool) => tool.name),
      context: parentConv.memory.context,
    });

    if (shouldBypassInternalReview(evaluation.action)) {
      return {
        outcome: "success",
        summary: resolveCompletedExecutionTaskSummary(subConversation, "子任务已完成。"),
        taskSucceeded: true,
      };
    }

    const decision = evaluation.action === "approve" ? "approve" : "request_changes";
    const reviewResult = await applyTaskExecutionReview({
      parentTaskId: parentConv.id,
      executionTaskId,
      decision,
      feedback: resolveInternalReviewFeedback(evaluation.message, evaluation.feedback),
    });

    if (!reviewResult.success) {
      return {
        outcome: "failed",
        summary: reviewResult.message,
        taskSucceeded: false,
        validationReason: reviewResult.message,
      };
    }

    const refreshedConversation = conversationRepository.load(executionTaskId);

    if (decision === "approve") {
      const payload = refreshedConversation
        ? extractCompletedExecutionTaskPayload(refreshedConversation)
        : null;
      const validation = validateCompletedExecutionTaskPayload(payload);
      if (!validation.ok) {
        const reason = validation.reason || "finishPhase 结果不符合要求。";
        return {
          outcome: "failed",
          summary: reason,
          taskSucceeded: false,
          validationReason: reason,
        };
      }

      return {
        outcome: "success",
        summary: resolveCompletedExecutionTaskSummary(refreshedConversation, reviewResult.message),
        taskSucceeded: true,
      };
    }

    if (refreshedConversation?.status === "completed") {
      continue;
    }

    if (refreshedConversation?.status === "error") {
      return {
        outcome: "failed",
        summary: "子任务在内部返工后执行失败。",
        taskSucceeded: false,
        validationReason: "子任务在内部返工后执行失败。",
      };
    }

    if (refreshedConversation?.status === "idle") {
      return {
        outcome: "interrupted",
        summary: "子任务在内部返工后已中断，无法继续自动处理。",
        taskSucceeded: false,
        validationReason: "子任务在内部返工后已中断，无法继续自动处理。",
      };
    }
  }

  return {
    outcome: "failed",
    summary: `子任务 ${executionTaskId} 的内部验证在 ${MAX_INTERNAL_REVIEW_ROUNDS} 轮后仍未收敛。`,
    taskSucceeded: false,
    validationReason: `子任务 ${executionTaskId} 的内部验证在 ${MAX_INTERNAL_REVIEW_ROUNDS} 轮后仍未收敛。`,
  };
};

export const __testing__ = {
  shouldBypassInternalReview,
};

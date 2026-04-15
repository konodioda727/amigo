import { conversationOrchestrator, conversationRepository } from "@/core/conversation";
import { logger } from "@/utils/logger";
import {
  extractCompletedExecutionTaskPayload,
  formatCompletedExecutionTaskPayload,
} from "../conversation/execution/taskExecutionResult";

export type TaskExecutionReviewDecision = "approve" | "request_changes";

export type TaskExecutionReviewResult = {
  success: boolean;
  status: "approved" | "rework_completed" | "interrupted" | "error";
  executionTaskId: string;
  message: string;
};

const buildVerificationFeedback = (feedback?: string) => {
  const normalized = feedback?.trim();
  if (!normalized) {
    return "自动审阅未通过。请根据当前任务要求补齐问题后重新提交 completeTask。";
  }

  return `自动审阅未通过，请按以下意见修改后重新提交 completeTask：\n\n${normalized}`;
};

export const applyTaskExecutionReview = async ({
  parentTaskId,
  executionTaskId,
  decision,
  feedback,
}: {
  parentTaskId: string;
  executionTaskId: string;
  decision: TaskExecutionReviewDecision;
  feedback?: string;
}): Promise<TaskExecutionReviewResult> => {
  const parentConversation = conversationRepository.load(parentTaskId);
  if (!parentConversation) {
    return {
      success: false,
      status: "error",
      executionTaskId,
      message: `未找到主任务 ${parentTaskId}`,
    };
  }

  const executionConversation = conversationRepository.load(executionTaskId);
  if (!executionConversation) {
    return {
      success: false,
      status: "error",
      executionTaskId,
      message: `未找到执行任务 ${executionTaskId}`,
    };
  }

  if (executionConversation.parentId !== parentTaskId) {
    return {
      success: false,
      status: "error",
      executionTaskId,
      message: `执行任务 ${executionTaskId} 不属于当前父任务`,
    };
  }

  const completedPayload = extractCompletedExecutionTaskPayload(executionConversation);
  if (!completedPayload) {
    return {
      success: false,
      status: "error",
      executionTaskId,
      message: `执行任务 ${executionTaskId} 当前没有可审阅的 completeTask 结果`,
    };
  }

  const executionTaskEntry = Object.entries(parentConversation.memory.executionTasks).find(
    ([, status]) => status.executionTaskId === executionTaskId,
  );
  const executionTaskDescription =
    executionTaskEntry?.[1]?.description || executionTaskEntry?.[0] || executionTaskId;
  const executor = conversationOrchestrator.getExecutor(executionTaskId);

  if (decision === "approve") {
    logger.info(`[applyTaskExecutionReview] 内部批准执行任务 ${executionTaskId} 完成`);
    parentConversation.updateExecutionTaskStatus(executionTaskDescription, {
      status: "completed",
      executionTaskId,
      completedAt: new Date().toISOString(),
    });

    return {
      success: true,
      status: "approved",
      executionTaskId,
      message: completedPayload
        ? `已批准执行任务结果：\n\n${formatCompletedExecutionTaskPayload(completedPayload)}`
        : `已批准执行任务 ${executionTaskId} 的完成结果`,
    };
  }

  logger.info(`[applyTaskExecutionReview] 内部打回执行任务 ${executionTaskId} 继续修改`);
  parentConversation.updateExecutionTaskStatus(executionTaskDescription, {
    status: "running",
    executionTaskId,
  });
  await conversationOrchestrator.setUserInput(
    executionConversation,
    buildVerificationFeedback(feedback),
  );
  await executor.execute(executionConversation);

  if (executionConversation.status === "idle") {
    parentConversation.updateExecutionTaskStatus(executionTaskDescription, {
      status: "interrupted",
      executionTaskId,
    });
  } else if (executionConversation.status === "error") {
    parentConversation.updateExecutionTaskStatus(executionTaskDescription, {
      status: "failed",
      executionTaskId,
      error: "执行任务在返工后执行失败",
    });
  }

  return {
    success: true,
    status: executionConversation.status === "idle" ? "interrupted" : "rework_completed",
    executionTaskId,
    message: buildVerificationFeedback(feedback),
  };
};

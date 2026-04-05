import { logger } from "@/utils/logger";
import { conversationRepository } from "../conversation/ConversationRepository";
import {
  extractPendingCompleteTaskPayload,
  formatCompletedSubTaskPayload,
} from "../conversation/subTaskResult";
import { taskOrchestrator } from "../conversation/TaskOrchestrator";

export type ReviewSubTaskDecision = "approve" | "request_changes";

export type ReviewSubTaskInvocationResult = {
  success: boolean;
  status: "approved" | "rework_started" | "error";
  subTaskId: string;
  message: string;
};

const buildReviewFeedback = (feedback?: string) => {
  const normalized = feedback?.trim();
  if (!normalized) {
    return "自动审阅未通过。请根据当前任务要求补齐问题后重新提交 completeTask。";
  }

  return `自动审阅未通过，请按以下意见修改后重新提交 completeTask：\n\n${normalized}`;
};

export const reviewSubTaskCompletion = async ({
  parentTaskId,
  subTaskId,
  decision,
  feedback,
}: {
  parentTaskId: string;
  subTaskId: string;
  decision: ReviewSubTaskDecision;
  feedback?: string;
}): Promise<ReviewSubTaskInvocationResult> => {
  const parentConversation = conversationRepository.load(parentTaskId);
  if (!parentConversation) {
    return {
      success: false,
      status: "error",
      subTaskId,
      message: `未找到主任务 ${parentTaskId}`,
    };
  }

  const subConversation = conversationRepository.load(subTaskId);
  if (!subConversation) {
    return {
      success: false,
      status: "error",
      subTaskId,
      message: `未找到子任务 ${subTaskId}`,
    };
  }

  if (subConversation.parentId !== parentTaskId) {
    return {
      success: false,
      status: "error",
      subTaskId,
      message: `子任务 ${subTaskId} 不属于当前主任务`,
    };
  }

  const pendingPayload = extractPendingCompleteTaskPayload(subConversation);
  if (
    !subConversation.pendingToolCall ||
    subConversation.pendingToolCall.toolName !== "completeTask"
  ) {
    return {
      success: false,
      status: "error",
      subTaskId,
      message: `子任务 ${subTaskId} 当前没有待审阅的 completeTask`,
    };
  }

  const subTaskEntry = Object.entries(parentConversation.memory.subTasks).find(
    ([, status]) => status.subTaskId === subTaskId,
  );
  const subTaskDescription = subTaskEntry?.[1]?.description || subTaskEntry?.[0] || subTaskId;
  const executor = taskOrchestrator.getExecutor(subTaskId);

  if (decision === "approve") {
    logger.info(`[reviewSubTask] 内部批准子任务 ${subTaskId} 完成`);
    subConversation.userInput = "confirm";
    subConversation.isAborted = false;
    await executor.execute(subConversation);

    return {
      success: true,
      status: "approved",
      subTaskId,
      message: pendingPayload
        ? `已批准子任务结果：\n\n${formatCompletedSubTaskPayload(pendingPayload)}`
        : `已批准子任务 ${subTaskId} 的完成结果`,
    };
  }

  logger.info(`[reviewSubTask] 内部打回子任务 ${subTaskId} 继续修改`);
  parentConversation.updateSubTaskStatus(subTaskDescription, {
    status: "running",
    subTaskId,
  });
  taskOrchestrator.setUserInput(subConversation, buildReviewFeedback(feedback));
  await executor.execute(subConversation);

  if (subConversation.status === "waiting_tool_confirmation") {
    parentConversation.updateSubTaskStatus(subTaskDescription, {
      status: "wait_review",
      subTaskId,
    });
  } else if (subConversation.status === "idle") {
    parentConversation.updateSubTaskStatus(subTaskDescription, {
      status: "waiting_user_input",
      subTaskId,
    });
  } else if (subConversation.status === "error") {
    parentConversation.updateSubTaskStatus(subTaskDescription, {
      status: "failed",
      subTaskId,
      error: "子任务在返工后执行失败",
    });
  }

  return {
    success: true,
    status: "rework_started",
    subTaskId,
    message: buildReviewFeedback(feedback),
  };
};

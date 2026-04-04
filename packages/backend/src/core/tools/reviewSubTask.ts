import { logger } from "@/utils/logger";
import { conversationRepository } from "../conversation/ConversationRepository";
import {
  extractPendingCompleteTaskPayload,
  formatCompletedSubTaskPayload,
} from "../conversation/subTaskResult";
import { taskOrchestrator } from "../conversation/TaskOrchestrator";
import { createTool } from "./base";

const buildReviewFeedback = (feedback?: string) => {
  const normalized = feedback?.trim();
  if (!normalized) {
    return "主任务审阅未通过。请根据当前任务要求补齐问题后重新提交 completeTask。";
  }

  return `主任务审阅未通过，请按以下意见修改后重新提交 completeTask：\n\n${normalized}`;
};

export const ReviewSubTask = createTool({
  name: "reviewSubTask",
  description:
    "审阅待审核的子任务 completeTask。主任务可选择批准完成，或给出修改意见后让子任务继续执行。",
  whenToUse:
    "当子任务处于 wait_review，且挂起了 completeTask 待审结果时使用。不要自己重做子任务内容，应先用这个工具批准或打回。",
  params: [
    {
      name: "subTaskId",
      optional: false,
      description: "待审阅的子任务 ID",
    },
    {
      name: "decision",
      optional: false,
      description: "审阅决定：approve 或 request_changes",
    },
    {
      name: "feedback",
      optional: true,
      description: "打回修改时给子任务的具体意见；approve 时可选",
    },
  ],
  async invoke({ params, context }) {
    const { subTaskId, decision, feedback } = params;
    const parentTaskId = context.taskId;

    const parentConversation = conversationRepository.load(parentTaskId);
    if (!parentConversation) {
      return {
        message: `未找到主任务 ${parentTaskId}`,
        toolResult: {
          success: false,
          status: "error",
          subTaskId,
          message: `未找到主任务 ${parentTaskId}`,
        },
      };
    }

    const subConversation = conversationRepository.load(subTaskId);
    if (!subConversation) {
      return {
        message: `未找到子任务 ${subTaskId}`,
        toolResult: {
          success: false,
          status: "error",
          subTaskId,
          message: `未找到子任务 ${subTaskId}`,
        },
      };
    }

    if (subConversation.parentId !== parentTaskId) {
      return {
        message: `子任务 ${subTaskId} 不属于当前主任务`,
        toolResult: {
          success: false,
          status: "error",
          subTaskId,
          message: `子任务 ${subTaskId} 不属于当前主任务`,
        },
      };
    }

    const pendingPayload = extractPendingCompleteTaskPayload(subConversation);
    if (
      !subConversation.pendingToolCall ||
      subConversation.pendingToolCall.toolName !== "completeTask"
    ) {
      return {
        message: `子任务 ${subTaskId} 当前没有待审阅的 completeTask`,
        toolResult: {
          success: false,
          status: "error",
          subTaskId,
          message: `子任务 ${subTaskId} 当前没有待审阅的 completeTask`,
        },
      };
    }

    const subTaskEntry = Object.entries(parentConversation.memory.subTasks).find(
      ([, status]) => status.subTaskId === subTaskId,
    );
    const subTaskDescription = subTaskEntry?.[1]?.description || subTaskEntry?.[0] || subTaskId;

    const executor = taskOrchestrator.getExecutor(subTaskId);

    if (decision === "approve") {
      logger.info(`[reviewSubTask] 主任务 ${parentTaskId} 批准子任务 ${subTaskId} 完成`);
      subConversation.userInput = "confirm";
      subConversation.isAborted = false;
      await executor.execute(subConversation);

      return {
        message: `已批准子任务 ${subTaskId} 的完成结果`,
        toolResult: {
          success: true,
          status: "approved",
          subTaskId,
          message: pendingPayload
            ? `已批准子任务结果：\n\n${formatCompletedSubTaskPayload(pendingPayload)}`
            : `已批准子任务 ${subTaskId} 的完成结果`,
        },
      };
    }

    logger.info(`[reviewSubTask] 主任务 ${parentTaskId} 打回子任务 ${subTaskId} 继续修改`);
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
      message: `已将审阅意见发送给子任务 ${subTaskId}`,
      toolResult: {
        success: true,
        status: "rework_started",
        subTaskId,
        message: buildReviewFeedback(feedback),
      },
    };
  },
});

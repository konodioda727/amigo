import { conversationOrchestrator, conversationRepository } from "@/core/conversation";
import {
  extractCompletedExecutionTaskPayload,
  validateCompletedExecutionTaskPayload,
} from "@/core/conversation/execution/taskExecutionResult";
import type { parseChecklist } from "@/core/templates/checklistParser";
import { logger } from "@/utils/logger";
import { buildDependencyResultContext } from "./dependencyContext";
import { resolveExecutionTaskFailureState } from "./executeTaskListScheduler";
import {
  buildExecutionWorkerConversationContext,
  buildSubAgentPrompt,
  buildTaskListContext,
  getExistingExecutionTaskStatus,
  getTaskKey,
  MAX_SUB_TASK_AUTO_RETRIES,
  markExecutionTaskInProgress,
  normalizeDescription,
  type ParentConversation,
  resolveExecutionWorkerTools,
  type TaskExecutionResult,
  type TaskExecutionType,
  updateExecutionTaskStatus,
} from "./executeTaskListShared";
import { handleInternalVerification } from "./executeTaskListVerification";

export const startNewTask = ({
  taskItem,
  filePath,
  parentTaskId,
  parentConv,
  executionType,
  completedTaskIds,
  allTasks,
  getToolByName,
}: {
  taskItem: ReturnType<typeof parseChecklist>["items"][number];
  filePath: string;
  parentTaskId: string;
  parentConv: ParentConversation;
  executionType: TaskExecutionType;
  completedTaskIds: Set<string>;
  allTasks: ReturnType<typeof parseChecklist>["items"];
  getToolByName: (
    name: string,
  ) => ReturnType<typeof resolveExecutionWorkerTools>["availableTools"][number] | undefined;
}) => {
  return (async (): Promise<TaskExecutionResult> => {
    const { description, lineNumber } = taskItem;
    let taskSucceeded = false;
    const cleanDescriptionForAgent = normalizeDescription(description);
    const {
      cleanDescription,
      availableToolNames,
      availableTools,
      forbiddenTools,
      ignoredLegacyTools,
    } = resolveExecutionWorkerTools(cleanDescriptionForAgent, getToolByName);
    const taskKey = getTaskKey(cleanDescriptionForAgent);
    const existingStatus =
      getExistingExecutionTaskStatus(parentConv, taskKey, cleanDescriptionForAgent) ||
      parentConv.memory.executionTasks[description];

    if (existingStatus?.executionTaskId && executionType === "failed") {
      const existingConversation = conversationRepository.load(existingStatus.executionTaskId);
      if (existingConversation && !["aborted", "completed"].includes(existingConversation.status)) {
        logger.info(
          `[ExecuteTaskList] 重新执行失败任务，先中断旧执行会话: ${existingStatus.executionTaskId}`,
        );
        conversationOrchestrator.interrupt(existingConversation);
      }
    }

    const reuseExecutionTaskId =
      executionType === "running"
        ? existingStatus?.executionTaskId
        : executionType === "new" &&
            existingStatus?.executionTaskId &&
            existingStatus.status !== "completed" &&
            existingStatus.status !== "failed" &&
            existingStatus.status !== "running"
          ? existingStatus.executionTaskId
          : undefined;

    if (ignoredLegacyTools.length > 0 || forbiddenTools.length > 0) {
      logger.warn(
        `[ExecuteTaskList] 任务 "${cleanDescription}" 使用了已忽略的旧版工具配置。ignored=${ignoredLegacyTools.join(", ") || "none"}, forbidden=${forbiddenTools.join(", ") || "none"}`,
      );
    }

    let summary = "";
    let outcome: TaskExecutionResult["outcome"] = "failed";
    let latestValidationReason = "";

    for (let attempt = 0; attempt <= MAX_SUB_TASK_AUTO_RETRIES; attempt += 1) {
      try {
        markExecutionTaskInProgress(filePath, lineNumber, description);
      } catch (e) {
        logger.error(`[ExecuteTaskList] 标记任务开始失败: ${e}`);
      }

      const dependencyResults = buildDependencyResultContext({
        dependencies: taskItem.dependencies,
        parentConversation: parentConv,
      });
      const subAgentPrompt = buildSubAgentPrompt({
        cleanDescription,
        availableToolNames,
        forbiddenTools,
        ignoredLegacyTools,
        dependencyResults,
        taskListContext: buildTaskListContext({
          allTasks,
          currentTaskLineNumber: taskItem.lineNumber,
        }),
        taskItem,
        retryFeedback:
          attempt > 0 && latestValidationReason
            ? `- ${latestValidationReason.split("\n").join("\n- ")}`
            : undefined,
      });

      try {
        const result = await conversationOrchestrator.runExecutionTask({
          subPrompt: subAgentPrompt,
          parentId: parentTaskId,
          target: cleanDescription,
          conversationContext: buildExecutionWorkerConversationContext(taskItem, allTasks),
          toolNames: availableToolNames,
          tools: availableTools,
          taskDescription: cleanDescriptionForAgent,
          executionTaskId: attempt === 0 ? reuseExecutionTaskId : undefined,
        });
        const subConversation = conversationRepository.load(result.executionTaskId);
        const completionPayload = subConversation
          ? extractCompletedExecutionTaskPayload(subConversation)
          : null;

        if (result.status === "interrupted") {
          summary = "执行任务已中断，任务表编排已停止，等待后续恢复或人工处理。";
          outcome = "interrupted";
          latestValidationReason = summary;
          parentConv.updateExecutionTaskStatus(cleanDescriptionForAgent, {
            status: "interrupted",
            executionTaskId: result.executionTaskId,
          });
          break;
        }

        const validation = validateCompletedExecutionTaskPayload(completionPayload);

        if (!validation.ok) {
          latestValidationReason = validation.reason || "finishPhase 结果不符合要求。";
          parentConv.updateExecutionTaskStatus(cleanDescriptionForAgent, {
            status: "failed",
            error: latestValidationReason,
            completedAt: new Date().toISOString(),
          });
          try {
            updateExecutionTaskStatus(filePath, lineNumber, cleanDescriptionForAgent, false);
          } catch (e) {
            logger.error(`[ExecuteTaskList] 回退未通过验收的任务状态失败: ${e}`);
          }

          if (attempt < MAX_SUB_TASK_AUTO_RETRIES) {
            logger.warn(
              `[ExecuteTaskList] 任务 "${cleanDescription}" 未通过自动验收，准备重试: ${latestValidationReason}`,
            );
            continue;
          }

          summary = latestValidationReason;
          outcome = "failed";
          break;
        }

        const verificationResult = await handleInternalVerification({
          parentConv,
          executionTaskId: result.executionTaskId,
          cleanDescriptionForAgent,
          availableTools,
        });
        summary = verificationResult.summary;
        outcome = verificationResult.outcome;
        taskSucceeded = verificationResult.taskSucceeded;
        latestValidationReason = verificationResult.validationReason || "";
        break;
      } catch (error) {
        const failureState = resolveExecutionTaskFailureState(error);
        summary = failureState.summary;
        outcome = failureState.outcome;
        parentConv.updateExecutionTaskStatus(cleanDescriptionForAgent, {
          status: failureState.status,
          error: failureState.error,
          completedAt: failureState.completedAt,
        });
        break;
      }
    }

    try {
      updateExecutionTaskStatus(filePath, lineNumber, cleanDescriptionForAgent, taskSucceeded);
    } catch (e) {
      logger.error(`[ExecuteTaskList] 更新任务状态失败: ${e}`);
    }

    const id = getTaskKey(cleanDescriptionForAgent);
    if (id && taskSucceeded) completedTaskIds.add(id);

    return {
      target: cleanDescription,
      success: taskSucceeded,
      outcome,
      summary,
      ignoredLegacyTools: ignoredLegacyTools.length > 0 ? ignoredLegacyTools : undefined,
    };
  })();
};

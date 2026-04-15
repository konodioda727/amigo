import { readFileSync, writeFileSync } from "node:fs";
import {
  type CompleteTaskWebsocketData,
  getNextWorkflowPhase,
  normalizeWorkflowPhaseSequence,
  type WorkflowAgentRole,
  type WorkflowPhase,
} from "@amigo-llm/types";
import {
  broadcaster,
  conversationRepository,
  hasConversationContinuations,
} from "@/core/conversation";
import { parseDesignExecutionHandoff } from "@/core/workflow/designExecutionHandoff";
import { logger } from "@/utils/logger";
import {
  getTaskId,
  parseChecklist,
  updateChecklistItemContent,
  updateProgressSection,
} from "../templates/checklistParser";
import { createTool } from "./base";
import { asyncToolJobRegistry } from "./base/asyncJobRegistry";
import { createToolResult } from "./result";
import { getTaskListPath } from "./taskList/utils";

const COMPLETE_TASK_CONTINUATION_SUMMARY = "【任务已完成】";
const buildPhaseAdvanceSummary = (phase: string) => `【当前阶段 ${phase}】`;
const resolveCompletedPhase = ({
  currentPhase,
  agentRole,
}: {
  currentPhase?: WorkflowPhase;
  agentRole?: WorkflowAgentRole;
}): WorkflowPhase | undefined => {
  if (currentPhase) {
    return currentPhase;
  }

  if (agentRole === "execution_worker") {
    return "execution";
  }

  if (agentRole === "verification_reviewer") {
    return "verification";
  }

  return undefined;
};

const buildCompleteTaskWebsocketData = ({
  kind,
  completedPhase,
  currentPhase,
  agentRole,
}: CompleteTaskWebsocketData): CompleteTaskWebsocketData => ({
  kind,
  ...(completedPhase ? { completedPhase } : {}),
  ...(currentPhase ? { currentPhase } : {}),
  ...(agentRole ? { agentRole } : {}),
});

const buildCompleteTaskResult = (
  message: string,
  result: string,
  summary?: string,
  websocketData?: CompleteTaskWebsocketData,
) =>
  createToolResult(result, {
    transportMessage: message,
    continuationSummary: COMPLETE_TASK_CONTINUATION_SUMMARY,
    continuationResult: summary?.trim() || message,
    ...(websocketData ? { websocketData } : {}),
  });

const buildToolErrorResult = (result: string, errorMessage: string) =>
  createToolResult(result, {
    transportMessage: errorMessage,
    continuationSummary: errorMessage,
    continuationResult: errorMessage,
    error: errorMessage,
  });

/**
 * 完成工具
 * controller 用于收尾当前阶段或任务；execution worker 额外会自动更新父任务的 execution 文档。
 */
export const CompleteTask = createTool({
  name: "completeTask",
  description:
    "🎯 用于完成当前职责。controller 用它完成当前 workflow 阶段；在 complete 阶段调用时才真正结束整个任务。execution worker 用它提交执行结果，并自动更新父任务的待办列表。",
  whenToUse:
    "仅在当前职责已真正完成时调用。controller：requirements/design/execution/verification 阶段中，表示当前阶段已经完成并应切换到下一阶段；complete 阶段中，表示整个任务最终完成。execution worker：表示当前执行任务已实现并自查完成。部分完成、仅汇报进度或未完成状态不要调用。",
  params: [
    {
      name: "summary",
      optional: false,
      description:
        "任务完成摘要。controller 用于简短面向用户总结；在 requirements 阶段应清楚概括整理后的用户需求和范围；execution worker 用于父任务自动验收与通知。",
    },
    {
      name: "result",
      optional: false,
      description:
        "任务完成的详细结果。controller：面向用户清晰说明阶段或最终结果；在 requirements 阶段必须把澄清后的用户需求、目标、约束和范围写清楚；在 design 阶段必须包含 `## 已确认事实`、`## 关键约束`、`## 实施计划` 三个二级标题，只有当仍有阻塞 execution 的事项时才额外填写 `## 未决问题`。execution worker：必须包含 `## 交付物`、`## 验证`、`## 遗留问题`、`## 下游说明` 四个二级标题。",
    },
    {
      name: "achievements",
      optional: true,
      description: "达到的效果或关键成果",
    },
    {
      name: "usage",
      optional: true,
      description: "如何使用结果的说明",
    },
  ],
  async invoke({ params, context }) {
    const { result } = params;
    const activeConversationStatuses = new Set([
      "streaming",
      "tool_executing",
      "waiting_tool_confirmation",
    ]);
    const pendingAsyncJobs = asyncToolJobRegistry.listRunningByTaskId(context.taskId);
    const hasPendingContinuation = hasConversationContinuations(context.taskId);

    if (context.parentId && (pendingAsyncJobs.length > 0 || hasPendingContinuation)) {
      const pendingJobSummary = pendingAsyncJobs.map((job) => job.toolName).join("、");
      const errorMessage = [
        "执行任务仍有未完成的异步后续动作，暂时不能调用 completeTask。",
        pendingAsyncJobs.length > 0 ? `仍在运行的后台任务：${pendingJobSummary}` : undefined,
        hasPendingContinuation ? "仍有等待消费的 continuation 队列。" : undefined,
        "请等待这些异步步骤回到当前执行任务并执行完毕后，再提交 completeTask。",
      ]
        .filter(Boolean)
        .join("\n");

      logger.warn(
        `[completeTask] 阻止执行任务 ${context.taskId} 过早完成：${errorMessage.replace(/\n/g, " | ")}`,
      );
      return createToolResult(result, {
        transportMessage: errorMessage,
        continuationSummary: errorMessage,
        continuationResult: errorMessage,
        error: errorMessage,
      });
    }

    if (!context.parentId) {
      const mainConversation =
        conversationRepository.get(context.taskId) || conversationRepository.load(context.taskId);

      if (context.agentRole === "controller" && context.currentPhase !== "complete") {
        if (!mainConversation) {
          const errorMessage = `未找到主任务 ${context.taskId}，无法推进 workflow 阶段`;
          return buildToolErrorResult(result, errorMessage);
        }

        const phaseSequence = normalizeWorkflowPhaseSequence(
          mainConversation.workflowState.phaseSequence,
        );
        const nextPhase = context.currentPhase
          ? getNextWorkflowPhase(context.currentPhase, phaseSequence)
          : undefined;
        if (!nextPhase) {
          const errorMessage = `当前阶段 ${context.currentPhase || "unknown"} 没有可推进的后续阶段`;
          return buildToolErrorResult(result, errorMessage);
        }

        if (context.currentPhase === "design" && nextPhase === "execution") {
          const parsedHandoff = parseDesignExecutionHandoff({
            summary: params.summary?.trim() || "design 阶段完成",
            result,
          });
          if (!parsedHandoff.ok) {
            const errorMessage = [
              "design 阶段尚未形成可直接执行的 handoff，暂时不能进入 execution。",
              ...parsedHandoff.errors,
              "请继续停留在 design，补齐缺失章节或收敛未决问题后再调用 completeTask。",
            ].join("\n");
            logger.warn(
              `[completeTask] 阻止主任务 ${context.taskId} 从 design 进入 execution：${parsedHandoff.errors.join(" | ")}`,
            );
            return buildToolErrorResult(result, errorMessage);
          }

          mainConversation.setWorkflowState({
            ...mainConversation.workflowState,
            designExecutionHandoff: parsedHandoff.handoff,
          });
        }

        mainConversation.advanceWorkflowPhase(nextPhase);
        mainConversation.setLastCompleteTaskDisposition("phase_advanced");

        const message = `阶段 ${context.currentPhase} 已完成，已进入 ${nextPhase}`;
        logger.info(
          `[completeTask] 主任务 ${context.taskId} 完成阶段 ${context.currentPhase}，切换到 ${nextPhase}`,
        );
        return createToolResult(result, {
          transportMessage: message,
          continuationSummary: buildPhaseAdvanceSummary(nextPhase),
          continuationResult: params.summary?.trim() || message,
          websocketData: buildCompleteTaskWebsocketData({
            kind: "phase_complete",
            completedPhase: resolveCompletedPhase({
              currentPhase: context.currentPhase,
              agentRole: context.agentRole,
            }),
            currentPhase: nextPhase,
            agentRole: context.agentRole,
          }),
          checkpointResult: {
            kind: "phase_complete",
            summary: params.summary?.trim() || message,
            result,
            completedPhase: resolveCompletedPhase({
              currentPhase: context.currentPhase,
              agentRole: context.agentRole,
            }),
            currentPhase: nextPhase,
            agentRole: context.agentRole,
          },
        });
      }

      mainConversation?.setLastCompleteTaskDisposition("task_completed");
      logger.info(`[completeTask] 主任务 ${context.taskId} 完成，直接返回最终结果`);
      return buildCompleteTaskResult(
        params.summary?.trim() || "任务已完成",
        result,
        params.summary,
        buildCompleteTaskWebsocketData({
          kind: "task_complete",
          completedPhase: resolveCompletedPhase({
            currentPhase: context.currentPhase,
            agentRole: context.agentRole,
          }),
          currentPhase:
            context.currentPhase || resolveCompletedPhase({ agentRole: context.agentRole }),
          agentRole: context.agentRole,
        }),
      );
    }

    const executionTaskId = context.taskId;
    const parentTaskId = context.parentId;

    logger.info(
      `[completeTask] 执行任务 ${executionTaskId} 完成，准备更新父任务 ${parentTaskId} 的 taskList`,
    );

    try {
      // 获取父任务（内存优先，不存在则从磁盘加载）
      const parentConversation =
        conversationRepository.get(parentTaskId) || conversationRepository.load(parentTaskId);
      if (!parentConversation) {
        logger.warn(`[completeTask] 未找到父任务 ${parentTaskId}`);
        // 即使找不到父任务，也返回结果
        return buildCompleteTaskResult(
          "任务完成（警告：未找到父任务）",
          result,
          params.summary,
          buildCompleteTaskWebsocketData({
            kind: "task_complete",
            completedPhase: resolveCompletedPhase({
              currentPhase: context.currentPhase,
              agentRole: context.agentRole,
            }),
            currentPhase:
              context.currentPhase || resolveCompletedPhase({ agentRole: context.agentRole }),
            agentRole: context.agentRole,
          }),
        );
      }

      // 从父任务的执行任务状态中找到对应的任务索引
      const executionTasks = parentConversation.memory.executionTasks;
      let taskKey: string | undefined;
      let taskDescription: string | undefined;

      for (const [key, status] of Object.entries(executionTasks)) {
        if (status.executionTaskId === executionTaskId) {
          taskKey = key;
          taskDescription = status.description;
          break;
        }
      }

      // 读取父任务的 taskList
      const taskListPath = getTaskListPath(parentTaskId);
      let taskListContent = "";
      try {
        taskListContent = readFileSync(taskListPath, "utf-8");
      } catch (error) {
        logger.warn(`[completeTask] 无法读取父任务的 taskList: ${error}`);
        return buildCompleteTaskResult(
          "任务完成（警告：无法读取父任务 taskList）",
          result,
          params.summary,
          buildCompleteTaskWebsocketData({
            kind: "task_complete",
            completedPhase: resolveCompletedPhase({
              currentPhase: context.currentPhase,
              agentRole: context.agentRole,
            }),
            currentPhase:
              context.currentPhase || resolveCompletedPhase({ agentRole: context.agentRole }),
            agentRole: context.agentRole,
          }),
        );
      }

      const normalizeDescription = (description: string) =>
        description.replace(/\(In Progress\)$/, "").trim();

      const parsed = parseChecklist(taskListContent);
      const normalizedTarget = taskDescription ? normalizeDescription(taskDescription) : undefined;
      let targetItem = normalizedTarget
        ? parsed.items.find((item) => normalizeDescription(item.description) === normalizedTarget)
        : undefined;

      if (!targetItem && taskKey) {
        targetItem = parsed.items.find((item) => getTaskId(item.description) === taskKey);
      }

      if (!targetItem) {
        logger.warn(`[completeTask] 未找到执行任务 ${executionTaskId} 对应的 taskList 条目`);
        if (taskDescription || taskKey) {
          parentConversation.updateExecutionTaskStatus(taskDescription || taskKey || "", {
            status: "completed",
            completedAt: new Date().toISOString(),
            executionTaskId,
          });
        }
        return buildCompleteTaskResult(
          "任务完成（警告：未找到 taskList 条目）",
          result,
          params.summary,
          buildCompleteTaskWebsocketData({
            kind: "task_complete",
            completedPhase: resolveCompletedPhase({
              currentPhase: context.currentPhase,
              agentRole: context.agentRole,
            }),
            currentPhase:
              context.currentPhase || resolveCompletedPhase({ agentRole: context.agentRole }),
            agentRole: context.agentRole,
          }),
        );
      }

      const finalDescription = normalizedTarget || normalizeDescription(targetItem.description);
      parentConversation.updateExecutionTaskStatus(finalDescription, {
        status: "completed",
        completedAt: new Date().toISOString(),
        executionTaskId,
      });
      const updatedContent = updateChecklistItemContent(
        taskListContent,
        targetItem.lineNumber,
        finalDescription,
        true,
      );
      const finalContent = updateProgressSection(updatedContent);

      // 写回文件
      writeFileSync(taskListPath, finalContent, "utf-8");
      logger.info(`[completeTask] 已更新父任务 ${parentTaskId} 的 taskList`);

      const parsedAfterComplete = parseChecklist(finalContent);
      const hasPendingTasks = parsedAfterComplete.items.some((item) => !item.completed);
      const parentIsRunning = activeConversationStatuses.has(parentConversation.status);
      const hasBlockingExecutionTasks = Object.values(
        parentConversation.memory.executionTasks,
      ).some((executionTaskStatus) => {
        const status = executionTaskStatus.status as string;
        return (
          status === "running" ||
          status === "failed" ||
          status === "interrupted" ||
          status === "waiting_user_input"
        );
      });

      if (hasPendingTasks && !parentIsRunning && !hasBlockingExecutionTasks) {
        const taskListTool = parentConversation.toolService.getToolFromName("taskList");
        if (!taskListTool) {
          logger.warn("[completeTask] 父任务缺少 taskList 工具，无法自动续跑 execution");
        } else {
          logger.info(
            `[completeTask] 父任务 ${parentTaskId} 当前未运行，自动触发 taskList(execute) 继续执行剩余任务`,
          );
          try {
            await taskListTool.invoke({
              params: { action: "execute" },
              context: {
                taskId: parentConversation.id,
                parentId: parentConversation.parentId,
                getSandbox: context.getSandbox,
                getToolByName: (name) => parentConversation.toolService.getToolFromName(name),
                signal: context.signal,
                postMessage: (msg: string | object) => {
                  broadcaster.postMessage(parentConversation, {
                    role: "assistant",
                    content: typeof msg === "string" ? msg : JSON.stringify(msg),
                    type: "message",
                    partial: true,
                  });
                },
              },
            });
          } catch (resumeError) {
            logger.error(
              `[completeTask] 自动触发父任务 taskList(execute) 失败: ${
                resumeError instanceof Error ? resumeError.message : String(resumeError)
              }`,
            );
          }
        }
      }

      // 通知父任务
      const completedTaskLabel = taskKey ? `Task ${taskKey}` : "执行任务";
      const notificationMessage = `${completedTaskLabel} 已完成`;

      broadcaster.broadcast(parentTaskId, {
        type: "alert",
        data: {
          message: notificationMessage,
          severity: "success",
          toastOnly: true,
          updateTime: Date.now(),
        },
      });

      return buildCompleteTaskResult(
        "任务完成，已更新父任务 taskList",
        result,
        params.summary,
        buildCompleteTaskWebsocketData({
          kind: "task_complete",
          completedPhase: resolveCompletedPhase({
            currentPhase: context.currentPhase,
            agentRole: context.agentRole,
          }),
          currentPhase:
            context.currentPhase || resolveCompletedPhase({ agentRole: context.agentRole }),
          agentRole: context.agentRole,
        }),
      );
    } catch (error) {
      logger.error(`[completeTask] 更新父任务 taskList 失败: ${error}`);
      // 即使更新失败，也返回结果
      return buildCompleteTaskResult(
        `任务完成（警告：更新父任务失败 - ${error}）`,
        result,
        params.summary,
        buildCompleteTaskWebsocketData({
          kind: "task_complete",
          completedPhase: resolveCompletedPhase({
            currentPhase: context.currentPhase,
            agentRole: context.agentRole,
          }),
          currentPhase:
            context.currentPhase || resolveCompletedPhase({ agentRole: context.agentRole }),
          agentRole: context.agentRole,
        }),
      );
    }
  },
});

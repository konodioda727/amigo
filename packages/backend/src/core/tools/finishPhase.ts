import { readFileSync, writeFileSync } from "node:fs";
import type { FinishPhaseWebsocketData, WorkflowAgentRole, WorkflowPhase } from "@amigo-llm/types";
import { conversationRepository } from "@/core/conversation/ConversationRepository";
import { hasConversationContinuations } from "@/core/conversation/context/asyncContinuations";
import { broadcaster } from "@/core/conversation/lifecycle/WebSocketBroadcaster";
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

const FINISH_PHASE_CONTINUATION_SUMMARY = "【任务已完成】";
const buildPhaseAdvanceSummary = (phase: string) => `【当前阶段 ${phase}】`;
const CONTROLLER_PHASE_ROUTES: Partial<Record<WorkflowPhase, WorkflowPhase[]>> = {
  requirements: ["design", "complete"],
  design: ["execution", "verification"],
  execution: ["verification", "design"],
  verification: ["complete", "design"],
};
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

const buildFinishPhaseWebsocketData = ({
  kind,
  completedPhase,
  currentPhase,
  agentRole,
}: FinishPhaseWebsocketData): FinishPhaseWebsocketData => ({
  kind,
  ...(completedPhase ? { completedPhase } : {}),
  ...(currentPhase ? { currentPhase } : {}),
  ...(agentRole ? { agentRole } : {}),
});

const buildFinishPhaseResult = (
  message: string,
  result: string,
  summary?: string,
  websocketData?: FinishPhaseWebsocketData,
) =>
  createToolResult(result, {
    transportMessage: message,
    continuationSummary: FINISH_PHASE_CONTINUATION_SUMMARY,
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

const normalizeCompletionText = (value: string | undefined): string => value?.trim() || "";

const formatAllowedNextPhases = (phases: WorkflowPhase[]): string => phases.join(" / ");

const validateControllerNextPhase = ({
  currentPhase,
  nextPhase,
}: {
  currentPhase: WorkflowPhase;
  nextPhase?: string;
}): { ok: true; nextPhase: WorkflowPhase } | { ok: false; errorMessage: string } => {
  if (!nextPhase) {
    return {
      ok: false,
      errorMessage: `当前阶段 ${currentPhase} 调用 finishPhase 时必须显式填写 nextPhase。`,
    };
  }

  const allowedNextPhases = CONTROLLER_PHASE_ROUTES[currentPhase] || [];
  if (!allowedNextPhases.includes(nextPhase as WorkflowPhase)) {
    return {
      ok: false,
      errorMessage: `当前阶段 ${currentPhase} 不允许进入 ${nextPhase}。允许的 nextPhase: ${formatAllowedNextPhases(
        allowedNextPhases,
      )}。`,
    };
  }

  return {
    ok: true,
    nextPhase: nextPhase as WorkflowPhase,
  };
};

const parseVerificationCompletionVerdict = ({
  summary,
  result,
}: {
  summary?: string;
  result: string;
}): {
  blocked: boolean;
  matchedKeyword?: string;
} => {
  const normalized = `${normalizeCompletionText(summary)}\n${normalizeCompletionText(result)}`;
  const blockedPatterns = [
    "验证不通过",
    "本轮验证结论：不通过",
    "本轮最终结论为验证不通过",
    "未通过",
    "不通过",
    "阻塞",
    "不能放行",
    "不可放行",
    "无法放行",
    "不能标记为已完成",
    "未跑通",
    "未执行",
    "无法证明",
    "未完成验证",
    "不能进入 complete",
    "不能将本轮标记为已放行",
  ];

  const matchedKeyword = blockedPatterns.find((pattern) => normalized.includes(pattern));
  return {
    blocked: Boolean(matchedKeyword),
    ...(matchedKeyword ? { matchedKeyword } : {}),
  };
};

/**
 * 完成工具
 * controller 用于收尾当前阶段或任务；execution worker 额外会自动更新父任务的 execution 文档。
 */
export const FinishPhase = createTool({
  name: "finishPhase",
  description:
    "🎯 用于收口当前阶段并显式声明下一步。controller 在非 complete 阶段必须通过 nextPhase 指定下一阶段；在 complete 阶段调用时才真正结束整个任务。execution worker 用它提交执行结果，并自动更新父任务的待办列表。",
  whenToUse:
    "仅在当前职责已真正完成时调用。controller：一开始总在 requirements 阶段，先完成需求分析，再用 nextPhase 显式分叉；推荐路径是 简单问询 requirements -> complete、检索任务 requirements -> design -> verification -> complete、需要执行的任务 requirements -> design -> execution -> verification -> complete。verification 未通过时应回到 design，不得进入 complete。execution worker：表示当前执行任务已实现并自查完成。部分完成、仅汇报进度或未完成状态不要调用。",
  params: [
    {
      name: "summary",
      optional: false,
      description:
        "当前阶段摘要。controller 用于简短总结当前阶段结论；在 requirements 阶段应清楚概括整理后的用户需求和范围；execution worker 用于父任务自动验收与通知。",
    },
    {
      name: "result",
      optional: false,
      description:
        "当前阶段的详细结果。controller：在 requirements 阶段必须把澄清后的用户需求、目标、约束和范围写清楚；在 design 阶段必须包含 `## 已确认事实`、`## 关键约束`、`## 实施计划` 三个二级标题，只有当仍有阻塞 execution 的事项时才额外填写 `## 未决问题`；在 verification 阶段必须写清真实检查记录和最终判定，如果是不通过、阻塞、未跑通、未执行或不能放行，就只能把 nextPhase 设为 design。execution worker：必须包含 `## 交付物`、`## 验证`、`## 遗留问题`、`## 下游说明` 四个二级标题，其中 `## 验证` 需要按 LSP/diagnostics、build/lint/工程级检查、真实链路集成测试的顺序写真实证据，不能只写局部测试或口头判断。",
    },
    {
      name: "nextPhase",
      optional: true,
      description:
        "controller 主任务在非 complete 阶段必填，表示下一步进入哪个阶段。允许路径：requirements -> design/complete；design -> execution/verification；execution -> verification/design；verification -> complete/design。execution worker 不需要填写。",
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
        "执行任务仍有未完成的异步后续动作，暂时不能调用 finishPhase。",
        pendingAsyncJobs.length > 0 ? `仍在运行的后台任务：${pendingJobSummary}` : undefined,
        hasPendingContinuation ? "仍有等待消费的 continuation 队列。" : undefined,
        "请等待这些异步步骤回到当前执行任务并执行完毕后，再提交 finishPhase。",
      ]
        .filter(Boolean)
        .join("\n");

      logger.warn(
        `[finishPhase] 阻止执行任务 ${context.taskId} 过早完成：${errorMessage.replace(/\n/g, " | ")}`,
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

        const currentPhase = context.currentPhase;
        if (!currentPhase) {
          const errorMessage = "未提供当前阶段，无法推进 workflow。";
          return buildToolErrorResult(result, errorMessage);
        }

        const nextPhaseValidation = validateControllerNextPhase({
          currentPhase,
          nextPhase: typeof params.nextPhase === "string" ? params.nextPhase : undefined,
        });
        if (!nextPhaseValidation.ok) {
          return buildToolErrorResult(result, nextPhaseValidation.errorMessage);
        }
        const nextPhase = nextPhaseValidation.nextPhase;

        if (currentPhase === "design" && nextPhase === "execution") {
          const parsedHandoff = parseDesignExecutionHandoff({
            summary: params.summary?.trim() || "design 阶段完成",
            result,
          });
          if (!parsedHandoff.ok) {
            const errorMessage = [
              "design 阶段尚未形成可直接执行的 handoff，暂时不能进入 execution。",
              ...parsedHandoff.errors,
              "请继续停留在 design，补齐缺失章节或收敛未决问题后再调用 finishPhase。",
            ].join("\n");
            logger.warn(
              `[finishPhase] 阻止主任务 ${context.taskId} 从 design 进入 execution：${parsedHandoff.errors.join(" | ")}`,
            );
            return buildToolErrorResult(result, errorMessage);
          }

          mainConversation.setWorkflowState({
            ...mainConversation.workflowState,
            designExecutionHandoff: parsedHandoff.handoff,
          });
        }

        if (currentPhase === "verification" && nextPhase === "complete") {
          const verificationVerdict = parseVerificationCompletionVerdict({
            summary: params.summary?.trim(),
            result,
          });
          if (verificationVerdict.blocked) {
            const errorMessage = [
              "verification 结果显示当前仍是“不通过”或“阻塞”，暂时不能进入 complete。",
              `识别到的阻塞信号：${verificationVerdict.matchedKeyword}`,
              "检查未通过、未运行、命令失败、环境缺失或真实链路未打通时，不能把 nextPhase 设为 complete。",
              "请继续当前会话推进：若只是补检查或补证据，继续留在 verification；若需要补环境、补实现或重新调查，请重新调用 finishPhase 并把 nextPhase 设为 design。",
            ].join("\n");
            logger.warn(
              `[finishPhase] 阻止主任务 ${context.taskId} 从 verification 进入 complete：${verificationVerdict.matchedKeyword}`,
            );
            return buildToolErrorResult(result, errorMessage);
          }
        }

        mainConversation.changeWorkflowPhase(nextPhase, {
          reason: `finishPhase 显式指定 nextPhase=${nextPhase}`,
        });
        mainConversation.setLastFinishPhaseDisposition("phase_advanced");

        const message = `阶段 ${currentPhase} 已完成，已进入 ${nextPhase}`;
        logger.info(
          `[finishPhase] 主任务 ${context.taskId} 完成阶段 ${currentPhase}，切换到 ${nextPhase}`,
        );
        return createToolResult(result, {
          transportMessage: message,
          continuationSummary: buildPhaseAdvanceSummary(nextPhase),
          continuationResult: params.summary?.trim() || message,
          websocketData: buildFinishPhaseWebsocketData({
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

      mainConversation?.setLastFinishPhaseDisposition("task_completed");
      logger.info(`[finishPhase] 主任务 ${context.taskId} 完成，直接返回最终结果`);
      return buildFinishPhaseResult(
        params.summary?.trim() || "任务已完成",
        result,
        params.summary,
        buildFinishPhaseWebsocketData({
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
      `[finishPhase] 执行任务 ${executionTaskId} 完成，准备更新父任务 ${parentTaskId} 的 taskList`,
    );

    try {
      // 获取父任务（内存优先，不存在则从磁盘加载）
      const parentConversation =
        conversationRepository.get(parentTaskId) || conversationRepository.load(parentTaskId);
      if (!parentConversation) {
        logger.warn(`[finishPhase] 未找到父任务 ${parentTaskId}`);
        // 即使找不到父任务，也返回结果
        return buildFinishPhaseResult(
          "任务完成（警告：未找到父任务）",
          result,
          params.summary,
          buildFinishPhaseWebsocketData({
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
        logger.warn(`[finishPhase] 无法读取父任务的 taskList: ${error}`);
        return buildFinishPhaseResult(
          "任务完成（警告：无法读取父任务 taskList）",
          result,
          params.summary,
          buildFinishPhaseWebsocketData({
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
        logger.warn(`[finishPhase] 未找到执行任务 ${executionTaskId} 对应的 taskList 条目`);
        if (taskDescription || taskKey) {
          parentConversation.updateExecutionTaskStatus(taskDescription || taskKey || "", {
            status: "completed",
            completedAt: new Date().toISOString(),
            executionTaskId,
          });
        }
        return buildFinishPhaseResult(
          "任务完成（警告：未找到 taskList 条目）",
          result,
          params.summary,
          buildFinishPhaseWebsocketData({
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
      logger.info(`[finishPhase] 已更新父任务 ${parentTaskId} 的 taskList`);

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
          logger.warn("[finishPhase] 父任务缺少 taskList 工具，无法自动续跑 execution");
        } else {
          logger.info(
            `[finishPhase] 父任务 ${parentTaskId} 当前未运行，自动触发 taskList(execute) 继续执行剩余任务`,
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
              `[finishPhase] 自动触发父任务 taskList(execute) 失败: ${
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

      return buildFinishPhaseResult(
        "任务完成，已更新父任务 taskList",
        result,
        params.summary,
        buildFinishPhaseWebsocketData({
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
      logger.error(`[finishPhase] 更新父任务 taskList 失败: ${error}`);
      // 即使更新失败，也返回结果
      return buildFinishPhaseResult(
        `任务完成（警告：更新父任务失败 - ${error}）`,
        result,
        params.summary,
        buildFinishPhaseWebsocketData({
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

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { logger } from "@/utils/logger";
import { hasConversationContinuations } from "../conversation/asyncContinuations";
import { conversationRepository } from "../conversation/ConversationRepository";
import { broadcaster } from "../conversation/WebSocketBroadcaster";
import {
  getTaskId,
  parseChecklist,
  updateChecklistItemContent,
  updateProgressSection,
} from "../templates/checklistParser";
import { createTool } from "./base";
import { asyncToolJobRegistry } from "./base/asyncJobRegistry";
import { createToolResult } from "./result";
import { getTaskDocsPath } from "./taskDocs/utils";

const COMPLETE_TASK_CONTINUATION_SUMMARY = "【任务已完成】";

const buildCompleteTaskResult = (message: string, result: string, summary?: string) =>
  createToolResult(result, {
    transportMessage: message,
    continuationSummary: COMPLETE_TASK_CONTINUATION_SUMMARY,
    continuationResult: summary?.trim() || message,
  });

/**
 * 完成工具
 * 主任务用于收尾当前任务；子任务额外会自动更新父任务的 taskList。
 */
export const CompleteTask = createTool({
  name: "completeTask",
  description:
    "🎯 任务完成后，使用此工具标记当前任务结束并返回最终结论。主任务直接用它结束当前任务；子任务还会自动更新父任务的待办列表。",
  whenToUse:
    "仅在当前任务范围内的问题已真正解决、最终交付物已准备好、且没有未完成步骤/待验证项/阻塞项时调用。主任务应使用面向用户、易读的最终结果；子任务应使用严格结构化结果供父任务审阅。部分完成、仅汇报进度或未完成状态不要调用。",
  params: [
    {
      name: "summary",
      optional: false,
      description: "任务完成摘要。主任务用于简短面向用户总结；子任务用于父任务自动验收与通知。",
    },
    {
      name: "result",
      optional: false,
      description:
        "任务完成的详细结果。主任务：面向用户清晰说明最终结果，无固定格式要求。子任务：必须包含 `## 交付物`、`## 验证`、`## 遗留问题`、`## 下游说明` 四个二级标题。",
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
        "子任务仍有未完成的异步后续动作，暂时不能调用 completeTask。",
        pendingAsyncJobs.length > 0 ? `仍在运行的后台任务：${pendingJobSummary}` : undefined,
        hasPendingContinuation ? "仍有等待消费的 continuation 队列。" : undefined,
        "请等待这些异步步骤回到当前子任务并执行完毕后，再提交 completeTask。",
      ]
        .filter(Boolean)
        .join("\n");

      logger.warn(
        `[completeTask] 阻止子任务 ${context.taskId} 过早完成：${errorMessage.replace(/\n/g, " | ")}`,
      );
      return createToolResult(result, {
        transportMessage: errorMessage,
        continuationSummary: errorMessage,
        continuationResult: errorMessage,
        error: errorMessage,
      });
    }

    if (!context.parentId) {
      logger.info(`[completeTask] 主任务 ${context.taskId} 完成，直接返回最终结果`);
      return buildCompleteTaskResult(
        params.summary?.trim() || "任务已完成",
        result,
        params.summary,
      );
    }

    const subTaskId = context.taskId;
    const parentTaskId = context.parentId;

    logger.info(
      `[completeTask] 子任务 ${subTaskId} 完成，准备更新父任务 ${parentTaskId} 的 taskList`,
    );

    try {
      // 获取父任务（内存优先，不存在则从磁盘加载）
      const parentConversation =
        conversationRepository.get(parentTaskId) || conversationRepository.load(parentTaskId);
      if (!parentConversation) {
        logger.warn(`[completeTask] 未找到父任务 ${parentTaskId}`);
        // 即使找不到父任务，也返回结果
        return buildCompleteTaskResult("任务完成（警告：未找到父任务）", result, params.summary);
      }

      // 从父任务的子任务状态中找到对应的任务索引
      const subTasks = parentConversation.memory.subTasks;
      let taskKey: string | undefined;
      let taskDescription: string | undefined;

      for (const [key, status] of Object.entries(subTasks)) {
        if (status.subTaskId === subTaskId) {
          taskKey = key;
          taskDescription = status.description;
          break;
        }
      }

      // 读取父任务的 taskList 文件
      const taskDocsPath = getTaskDocsPath(parentTaskId);
      const taskListPath = path.join(taskDocsPath, "taskList.md");

      let taskListContent = "";
      try {
        taskListContent = readFileSync(taskListPath, "utf-8");
      } catch (error) {
        logger.warn(`[completeTask] 无法读取父任务的 taskList 文件: ${error}`);
        return buildCompleteTaskResult(
          "任务完成（警告：无法读取父任务 taskList）",
          result,
          params.summary,
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
        logger.warn(`[completeTask] 未找到子任务 ${subTaskId} 对应的 taskList 项`);
        if (taskDescription || taskKey) {
          parentConversation.updateSubTaskStatus(taskDescription || taskKey || "", {
            status: "completed",
            completedAt: new Date().toISOString(),
            subTaskId,
          });
        }
        return buildCompleteTaskResult(
          "任务完成（警告：未找到 taskList 项）",
          result,
          params.summary,
        );
      }

      const finalDescription = normalizedTarget || normalizeDescription(targetItem.description);
      parentConversation.updateSubTaskStatus(finalDescription, {
        status: "completed",
        completedAt: new Date().toISOString(),
        subTaskId,
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
      const hasRunningSubTasks = Object.values(parentConversation.memory.subTasks).some(
        (subTaskStatus) =>
          subTaskStatus.status === "running" ||
          subTaskStatus.status === "waiting_user_input" ||
          subTaskStatus.status === "wait_review",
      );

      if (hasPendingTasks && !parentIsRunning && !hasRunningSubTasks) {
        const executeTaskListTool =
          parentConversation.toolService.getToolFromName("executeTaskList");
        if (!executeTaskListTool) {
          logger.warn("[completeTask] 父任务缺少 executeTaskList 工具，无法自动续跑 taskList");
        } else {
          logger.info(
            `[completeTask] 父任务 ${parentTaskId} 当前未运行，自动触发 executeTaskList 继续执行剩余任务`,
          );
          try {
            await executeTaskListTool.invoke({
              params: {},
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
              `[completeTask] 自动触发父任务 executeTaskList 失败: ${
                resumeError instanceof Error ? resumeError.message : String(resumeError)
              }`,
            );
          }
        }
      }

      // 通知父任务
      const completedTaskLabel = taskKey ? `Task ${taskKey}` : "子任务";
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

      return buildCompleteTaskResult("任务完成，已更新父任务待办列表", result, params.summary);
    } catch (error) {
      logger.error(`[completeTask] 更新父任务 taskList 失败: ${error}`);
      // 即使更新失败，也返回结果
      return buildCompleteTaskResult(
        `任务完成（警告：更新父任务失败 - ${error}）`,
        result,
        params.summary,
      );
    }
  },
});

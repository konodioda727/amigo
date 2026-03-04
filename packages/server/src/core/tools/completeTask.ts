import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { logger } from "@/utils/logger";
import { conversationRepository } from "../conversation/ConversationRepository";
import { broadcaster } from "../conversation/WebSocketBroadcaster";
import {
  getTaskId,
  parseChecklist,
  updateChecklistItemContent,
  updateProgressSection,
} from "../templates/checklistParser";
import { createTool } from "./base";
import { getTaskDocsPath } from "./taskDocs/utils";

/**
 * 子任务完成工具
 * 用于子任务完成时自动更新父任务的 taskList，并标记任务结束
 */
export const CompleteTask = createTool({
  name: "completeTask",
  description:
    "🎯 【子任务专用】子任务完成后，使用此工具标记任务结束、返回最终结论，并自动更新父任务的待办列表。**这是子任务结束的唯一正确方式。**",
  whenToUse:
    "仅在子任务已完成时调用，用于回传 summary/result 并标记父任务对应项完成。主任务或未完成状态不要调用。",
  params: [
    {
      name: "summary",
      optional: false,
      description: "任务完成摘要，简短描述完成了什么（1-2句话）",
    },
    {
      name: "result",
      optional: false,
      description: "任务完成的详细结果，使用 Markdown 格式输出完整内容",
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
    const { summary, result, achievements, usage } = params;
    const activeConversationStatuses = new Set([
      "streaming",
      "tool_executing",
      "waiting_tool_confirmation",
    ]);

    // 检查是否是子任务
    if (!context.parentId) {
      logger.error("[completeTask] 此工具只能在子任务中使用");
      return {
        message: "错误：completeTask 工具只能在子任务中使用",
        toolResult: "错误：completeTask 工具只能在子任务中使用",
      };
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
        return {
          message: "任务完成（警告：未找到父任务）",
          toolResult: result,
        };
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
        return {
          message: "任务完成（警告：无法读取父任务 taskList）",
          toolResult: result,
        };
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
        return {
          message: "任务完成（警告：未找到 taskList 项）",
          toolResult: result,
        };
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
          subTaskStatus.status === "running" || subTaskStatus.status === "waiting_user_input",
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
      const notificationMessage = [
        `✅ 子任务已完成：${summary}`,
        achievements ? `\n📊 成果：${achievements}` : "",
        usage ? `\n💡 使用方法：${usage}` : "",
      ]
        .filter(Boolean)
        .join("");

      broadcaster.broadcast(parentTaskId, {
        type: "alert",
        data: {
          message: notificationMessage,
          severity: "info",
          updateTime: Date.now(),
        },
      });

      return {
        message: "任务完成，已更新父任务待办列表",
        toolResult: result,
      };
    } catch (error) {
      logger.error(`[completeTask] 更新父任务 taskList 失败: ${error}`);
      // 即使更新失败，也返回结果
      return {
        message: `任务完成（警告：更新父任务失败 - ${error}）`,
        toolResult: result,
      };
    }
  },
});

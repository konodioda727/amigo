import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  parseChecklist,
  updateChecklistItemByDescription,
  updateProgressSection,
} from "@/core/templates/checklistParser";
import { logger } from "@/utils/logger";
import { createTool } from "../base";
import { getTaskDocsPath } from "./utils";

/**
 * 更新任务列表工具
 * 用于更新当前任务的 taskList.md 中的任务状态和进度统计
 */
export const UpdateTaskList = createTool({
  name: "updateTaskList",
  description:
    "更新当前任务的 taskList.md 中的任务状态。用于在执行阶段标记任务为完成，并自动更新进度统计。",
  whenToUse:
    "**工具性质：**\n" +
    "这是一个任务状态更新工具，用于在执行阶段追踪任务完成情况。\n\n" +
    "**适用场景：**\n" +
    "1. **任务完成：** 当子 Agent 完成任务后，标记对应任务为已完成\n" +
    "2. **任务回退：** 如果任务验证失败，可以将任务标记回未完成状态\n" +
    "3. **进度追踪：** 自动更新文档中的进度统计部分\n\n" +
    "**更新方式：**\n" +
    "- 通过任务描述精确匹配要更新的任务\n" +
    "- 将 `- [ ]` 更新为 `- [x]` 或反之\n" +
    "- 自动更新 Progress 部分的统计数据",

  useExamples: [
    `<updateTaskList>
  <taskDescription>Task 1.1: 实现数据查询接口</taskDescription>
  <completed>true</completed>
</updateTaskList>`,
    `<updateTaskList>
  <taskDescription>实现密码加密存储</taskDescription>
  <completed>true</completed>
</updateTaskList>`,
  ],

  params: [
    {
      name: "taskDescription",
      optional: false,
      description: "要更新的任务描述，必须精确匹配 taskList.md 中的任务描述（不含 checkbox 部分）",
    },
    {
      name: "completed",
      optional: false,
      description: "任务是否完成：true 表示完成（标记为 [x]），false 表示未完成（标记为 [ ]）",
    },
  ],

  async invoke({ params, context }) {
    const { taskDescription, completed } = params;
    const { taskId } = context;

    if (!taskId) {
      const errorMsg = "taskId 不能为空";
      return {
        message: errorMsg,
        toolResult: {
          success: false,
          message: errorMsg,
        },
      };
    }

    // 解析 completed 参数
    const isCompleted = completed === "true" || completed === true;

    const taskDocsPath = getTaskDocsPath(taskId as string);
    const filePath = path.join(taskDocsPath, "taskList.md");

    try {
      // 检查文件是否存在
      if (!existsSync(filePath)) {
        const errorMsg = `任务列表文件不存在: ${filePath}`;
        return {
          message: errorMsg,
          toolResult: {
            success: false,
            message: errorMsg,
          },
        };
      }

      // 读取当前文件内容
      const currentContent = readFileSync(filePath, "utf-8");

      // 解析当前任务列表，检查任务是否存在
      const parseResult = parseChecklist(currentContent);
      const targetTask = parseResult.items.find((item) => item.description === taskDescription);

      if (!targetTask) {
        const errorMsg = `未找到匹配的任务: "${taskDescription}"`;
        return {
          message: errorMsg,
          toolResult: {
            success: false,
            message: errorMsg,
            availableTasks: parseResult.items.map((item) => item.description),
          },
        };
      }

      // 检查任务状态是否需要更新
      if (targetTask.completed === isCompleted) {
        const statusText = isCompleted ? "已完成" : "未完成";
        const noChangeMsg = `任务 "${taskDescription}" 已经是${statusText}状态，无需更新`;
        return {
          message: noChangeMsg,
          toolResult: {
            success: true,
            message: noChangeMsg,
            progress: {
              total: parseResult.total,
              completed: parseResult.completed,
              remaining: parseResult.remaining,
              percentage: parseResult.percentage,
            },
          },
        };
      }

      // 更新任务状态
      let updatedContent = updateChecklistItemByDescription(
        currentContent,
        taskDescription,
        isCompleted,
      );

      // 更新进度统计
      updatedContent = updateProgressSection(updatedContent);

      // 写回文件
      writeFileSync(filePath, updatedContent, "utf-8");

      // 验证更新是否成功
      const verifyContent = readFileSync(filePath, "utf-8");
      const verifyResult = parseChecklist(verifyContent);
      const verifyTask = verifyResult.items.find((item) => item.description === taskDescription);

      if (!verifyTask || verifyTask.completed !== isCompleted) {
        throw new Error("任务状态更新验证失败");
      }

      const statusText = isCompleted ? "已完成" : "未完成";
      const successMsg = `成功将任务 "${taskDescription}" 标记为${statusText}`;
      logger.info(`[UpdateTaskList] ${successMsg}`);

      return {
        message: successMsg,
        toolResult: {
          success: true,
          message: successMsg,
          progress: {
            total: verifyResult.total,
            completed: verifyResult.completed,
            remaining: verifyResult.remaining,
            percentage: verifyResult.percentage,
          },
        },
      };
    } catch (error) {
      const errorMsg = `更新任务列表失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`[UpdateTaskList] ${errorMsg}`);

      return {
        message: errorMsg,
        toolResult: {
          success: false,
          message: errorMsg,
        },
      };
    }
  },
});

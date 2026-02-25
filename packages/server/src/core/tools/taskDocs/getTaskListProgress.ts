import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { conversationRepository } from "@/core/conversation/ConversationRepository";
import { parseChecklist } from "@/core/templates/checklistParser";
import { logger } from "@/utils/logger";
import { createTool } from "../base";
import { getTaskDocsPath } from "./utils";

/**
 * 获取任务列表进度工具
 * 用于获取当前任务的 taskList.md 进度统计
 */
export const GetTaskListProgress = createTool({
  name: "getTaskListProgress",
  description: "获取当前任务的 taskList.md 进度统计。用于快速了解任务完成情况。",
  whenToUse:
    "**工具性质：**\n" +
    "这是一个进度查询工具，用于获取任务列表的完成情况统计。\n\n" +
    "**适用场景：**\n" +
    "1. **进度检查：** 在执行阶段查看当前完成进度\n" +
    "2. **完成判断：** 判断是否所有任务都已完成\n" +
    "3. **状态报告：** 向用户报告当前工作进度\n\n" +
    "**异步执行注意：**\n" +
    "- `executeTaskList` 为异步任务，会自动推送进展和完成消息\n" +
    "- 不要在短时间内反复调用本工具轮询；仅在用户明确要求、执行卡住或失败排障时使用\n\n" +
    "**返回信息：**\n" +
    "- 总任务数\n" +
    "- 已完成任务数\n" +
    "- 剩余任务数\n" +
    "- 完成百分比\n" +
    "- 待完成任务列表",

  useExamples: [`<getTaskListProgress />`],

  params: [],

  async invoke({ context }) {
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

      // 读取文件内容
      const content = readFileSync(filePath, "utf-8");

      // 解析任务列表
      const parseResult = parseChecklist(content);
      const pendingTasks = parseResult.items
        .filter((item) => !item.completed)
        .map((item) => item.description);
      const completedTasks = parseResult.items
        .filter((item) => item.completed)
        .map((item) => item.description);

      const currentConversation =
        conversationRepository.get(taskId as string) ||
        conversationRepository.load(taskId as string);
      const subTaskStatuses = currentConversation?.memory.subTasks || {};
      const statusList = Object.values(subTaskStatuses);
      const runningSubTasks = statusList
        .filter((item) => item.status === "running")
        .map((item) => item.description || item.subTaskId || "未知任务");
      const waitingSubTasks = statusList
        .filter((item) => item.status === "waiting_user_input")
        .map((item) => item.description || item.subTaskId || "未知任务");
      const failedSubTasks = statusList
        .filter((item) => item.status === "failed")
        .map((item) => ({
          task: item.description || item.subTaskId || "未知任务",
          error: item.error || "未知错误",
        }));

      const isAllDone = parseResult.total > 0 && parseResult.remaining === 0;
      const statusText = isAllDone
        ? "所有任务已完成！"
        : `还有 ${parseResult.remaining} 个任务待完成`;

      const successMsg = `任务进度: ${parseResult.completed}/${parseResult.total} (${parseResult.percentage}%) - ${statusText}；运行中 ${runningSubTasks.length}，等待输入 ${waitingSubTasks.length}，失败 ${failedSubTasks.length}`;
      logger.info(`[GetTaskListProgress] ${successMsg}`);

      return {
        message: successMsg,
        toolResult: {
          success: true,
          message: successMsg,
          progress: {
            total: parseResult.total,
            completed: parseResult.completed,
            remaining: parseResult.remaining,
            percentage: parseResult.percentage,
            running: runningSubTasks.length,
            waitingUserInput: waitingSubTasks.length,
            failed: failedSubTasks.length,
          },
          isAllCompleted: isAllDone,
          pendingTasks,
          completedTasks,
          runningSubTasks,
          waitingSubTasks,
          failedSubTasks,
        },
      };
    } catch (error) {
      const errorMsg = `获取任务进度失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`[GetTaskListProgress] ${errorMsg}`);

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

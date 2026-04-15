import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createTool } from "../base";
import { createToolResult } from "../result";
import {
  buildTaskListMarkdown,
  ensureDirectoryExists,
  getTaskListPath,
  normalizeTaskListItems,
  parseTaskListFile,
  resolveAccessibleTaskListTaskId,
} from "./utils";

const normalizeTaskListAction = (params: {
  action?: string;
  tasks?: unknown[];
}): "read" | "replace" | "execute" => {
  if (params.action === "execute") {
    return "execute";
  }
  if (params.action === "replace") {
    return "replace";
  }
  if (params.action === "read") {
    return "read";
  }
  return Array.isArray(params.tasks) ? "execute" : "read";
};

const buildTaskListContinuationSummary = (action: "read" | "replace" | "execute") => {
  if (action === "read") return "【已读取 taskList】";
  if (action === "replace") return "【已更新 taskList】";
  return "【执行阶段进行中】";
};

export const TaskList = createTool({
  name: "taskList",
  description:
    "读取或执行当前任务的 taskList。execution 阶段可直接传入 tasks，先生成 taskList 再立即执行。",
  whenToUse: "需要查看当前任务清单时使用 read；需要按依赖关系拆成子任务并立即推进时使用 execute。",
  params: [
    {
      name: "action",
      optional: true,
      description:
        "可选：`read` 读取当前 taskList；`replace` 仅更新 taskList；`execute` 执行 taskList。默认：有 tasks 时为 execute，否则为 read。",
    },
    {
      name: "tasks",
      optional: true,
      type: "array",
      description: "replace / execute 时可选传入的任务数组。",
      params: [
        {
          name: "task",
          optional: false,
          type: "object",
          description: "单个 taskList 任务项。",
          params: [
            { name: "id", optional: false, description: "任务 ID，例如 T1、task-a、1.1" },
            { name: "title", optional: false, description: "任务标题，不含 Task <ID> 前缀" },
            {
              name: "deps",
              optional: true,
              type: "array",
              description: '依赖任务 ID 列表，例如 ["init-repo"]',
              params: [
                { name: "dep", optional: false, description: "依赖任务 ID，例如 init-repo" },
              ],
            },
          ],
        },
      ],
    },
    {
      name: "taskId",
      optional: true,
      description: "可选：目标任务 ID。默认读取/执行当前任务；子任务可传父任务 ID。",
    },
  ],
  async invoke({ params, context }) {
    const { taskId, parentId } = context;
    if (!taskId) {
      return createToolResult(
        {
          success: false,
          filePath: "",
          markdown: "",
          tasks: [],
          message: "taskId 不能为空",
        },
        { transportMessage: "taskId 不能为空" },
      );
    }

    const action = normalizeTaskListAction(params);
    const { taskId: resolvedTaskId, error: accessError } = resolveAccessibleTaskListTaskId({
      currentTaskId: taskId,
      parentTaskId: parentId,
      requestedTaskId: params.taskId,
    });
    if (!resolvedTaskId) {
      const message = accessError || "无法解析 taskList 目标任务";
      return createToolResult(
        {
          success: false,
          filePath: "",
          markdown: "",
          tasks: [],
          message,
        },
        { transportMessage: message },
      );
    }

    const filePath = getTaskListPath(resolvedTaskId);

    if (action === "read") {
      const markdown = existsSync(filePath)
        ? readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n")
        : "";
      const tasks = markdown.trim() ? parseTaskListFile(markdown) : [];
      const message =
        tasks.length > 0 ? `成功读取 ${tasks.length} 条 taskList 任务` : "当前还没有 taskList";
      return createToolResult(
        {
          success: true,
          taskId: resolvedTaskId,
          filePath,
          markdown,
          tasks,
          message,
        },
        {
          transportMessage: message,
          continuationSummary: buildTaskListContinuationSummary("read"),
          continuationResult: { success: true, filePath, markdown, tasks, message },
        },
      );
    }

    if (action === "replace") {
      const rawTasks = Array.isArray(params.tasks) ? params.tasks : [];
      const normalized = normalizeTaskListItems(rawTasks);
      if (!normalized.tasks) {
        const message =
          rawTasks.length === 0
            ? "replace 模式下必须提供至少一条 taskList 任务。"
            : normalized.message || "taskList 校验失败";
        return createToolResult(
          {
            success: false,
            taskId: resolvedTaskId,
            filePath,
            markdown: "",
            tasks: [],
            message,
          },
          { transportMessage: message },
        );
      }

      ensureDirectoryExists(filePath.replace(/\/[^/]+$/, ""));
      const markdown = buildTaskListMarkdown(normalized.tasks);
      writeFileSync(filePath, markdown, "utf-8");
      const message = `成功写入 ${normalized.tasks.length} 条 taskList 任务`;
      return createToolResult(
        {
          success: true,
          taskId: resolvedTaskId,
          filePath,
          markdown,
          tasks: normalized.tasks,
          message,
        },
        {
          transportMessage: message,
          continuationSummary: buildTaskListContinuationSummary("replace"),
          continuationResult: {
            success: true,
            filePath,
            markdown,
            tasks: normalized.tasks,
            message,
          },
        },
      );
    }

    const { runTaskListAction } = await import("./taskListExecution");
    return runTaskListAction({
      params,
      context,
      resolvedTaskId,
      filePath,
      continuationSummary: buildTaskListContinuationSummary("execute"),
    });
  },
});

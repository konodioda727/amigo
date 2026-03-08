import { writeFileSync } from "node:fs";
import path from "node:path";
import { getTaskId, parseChecklist } from "@/core/templates/checklistParser";
import { logger } from "@/utils/logger";
import { createTool } from "../base";
import { DOC_TYPE_TO_FILENAME, ensureDirectoryExists, getTaskDocsPath } from "./utils";

const TASK_LIST_LINE_EXAMPLE =
  "- [ ] Task 1.1: 实现 XXX [tools: readFile, editFile] [deps: Task 1.0]";

const validateTaskListContent = (content: string): string | null => {
  const parseResult = parseChecklist(content);
  const { items } = parseResult;

  if (items.length === 0) {
    return `taskList 至少要有一条 checklist 任务。示例：${TASK_LIST_LINE_EXAMPLE}`;
  }

  const invalidIdItems = items.filter((item) => !getTaskId(item.description));
  const invalidToolsItems = items.filter((item) => !/\[tools:\s*[^\]]+\]/i.test(item.description));

  const idCounts = new Map<string, number>();
  for (const item of items) {
    const taskId = getTaskId(item.description);
    if (!taskId) continue;
    idCounts.set(taskId, (idCounts.get(taskId) || 0) + 1);
  }

  const duplicatedTaskIds = Array.from(idCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([taskId]) => taskId);

  if (
    invalidIdItems.length === 0 &&
    invalidToolsItems.length === 0 &&
    duplicatedTaskIds.length === 0
  ) {
    return null;
  }

  const invalidIdLines = invalidIdItems
    .map((item) => `- L${item.lineNumber + 1}: ${item.rawLine.trim()}`)
    .join("\n");
  const invalidToolsLines = invalidToolsItems
    .map((item) => `- L${item.lineNumber + 1}: ${item.rawLine.trim()}`)
    .join("\n");
  const duplicatedIdsText =
    duplicatedTaskIds.length > 0 ? `重复的 Task ID：${duplicatedTaskIds.join(", ")}` : "";

  return [
    "taskList 格式校验失败：",
    invalidIdItems.length > 0 ? `1) 任务行必须使用 "Task X.Y: ..."：\n${invalidIdLines}` : "",
    invalidToolsItems.length > 0 ? `2) 每条任务必须包含 [tools: ...]：\n${invalidToolsLines}` : "",
    duplicatedIdsText ? `3) ${duplicatedIdsText}` : "",
    `示例：${TASK_LIST_LINE_EXAMPLE}`,
  ]
    .filter(Boolean)
    .join("\n\n");
};

/**
 * 创建任务文档工具
 * 用于创建当前任务的三个阶段文档：requirements.md, design.md, taskList.md
 */
export const CreateTaskDocs = createTool({
  name: "createTaskDocs",
  description:
    "创建当前任务的阶段文档（requirements/design/taskList）。每个任务只有三个固定文档；当 phase=taskList 时，content 必须使用严格 checklist 协议。",
  whenToUse:
    "仅在 Structured Spec 流程下创建 requirements/design/taskList 时使用。简单任务或闲聊不要调用。",

  params: [
    {
      name: "phase",
      optional: false,
      description: "文档类型：requirements（需求文档）、design（设计文档）、taskList（任务列表）",
    },
    {
      name: "content",
      optional: false,
      description:
        '文档内容，使用 Markdown。若 phase=taskList，任务行必须严格为 checklist 且满足：1) 每条任务一行，格式 "- [ ] Task X.Y: 描述 [tools: tool1, tool2] [deps: Task 1.0, Task 1.1]"（deps 可省略）；2) Task ID 唯一；3) 每条任务必须包含 [tools: ...]。',
    },
  ],

  async invoke({ params, context }) {
    const { phase, content } = params;
    const { taskId } = context;
    const fileName = DOC_TYPE_TO_FILENAME[phase] || "";

    if (!taskId) {
      const errorMsg = "taskId 不能为空";
      return {
        message: errorMsg,
        toolResult: {
          success: false,
          phase,
          content,
          filePath: "",
          message: errorMsg,
        },
      };
    }

    // 验证 phase 参数
    if (!["requirements", "design", "taskList"].includes(phase)) {
      const errorMsg = `无效的文档类型: ${phase}。支持的类型：requirements、design、taskList`;
      return {
        message: errorMsg,
        toolResult: {
          success: false,
          phase,
          content,
          filePath: "",
          message: errorMsg,
        },
      };
    }

    if (phase === "taskList") {
      const formatError = validateTaskListContent(content);
      if (formatError) {
        return {
          message: formatError,
          toolResult: {
            success: false,
            phase,
            content,
            filePath: "",
            message: formatError,
          },
        };
      }
    }

    // 构建文件路径
    if (!fileName) {
      const errorMsg = `无法获取文档文件名: ${phase}`;
      return {
        message: errorMsg,
        toolResult: {
          success: false,
          phase,
          content,
          filePath: "",
          message: errorMsg,
        },
      };
    }
    const taskDocsPath = getTaskDocsPath(taskId as string);
    const filePath = path.join(taskDocsPath, fileName);

    try {
      // 确保目录存在
      ensureDirectoryExists(taskDocsPath);

      // 写入文件
      writeFileSync(filePath, content, "utf-8");

      const successMsg = `成功创建文档: ${fileName}`;
      logger.info(`[CreateTaskDocs] ${successMsg}`);

      return {
        message: successMsg,
        toolResult: {
          success: true,
          phase,
          content,
          filePath,
          message: successMsg,
        },
      };
    } catch (error) {
      const errorMsg = `创建文档失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`[CreateTaskDocs] ${errorMsg}`);

      return {
        message: errorMsg,
        toolResult: {
          success: false,
          phase,
          content,
          filePath,
          message: errorMsg,
        },
      };
    }
  },
});

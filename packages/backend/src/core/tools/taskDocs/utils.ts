import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getTaskStoragePath } from "@/core/storage";
import { getTaskId, parseChecklist } from "@/core/templates/checklistParser";

/**
 * 文档类型到文件名的映射
 */
export const DOC_TYPE_TO_FILENAME: Record<string, string> = {
  requirements: "requirements.md",
  design: "design.md",
  taskList: "taskList.md",
};

/**
 * 将字符串转换为 kebab-case 格式
 */
export function toKebabCase(str: string): string {
  return str
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1-$2") // camelCase -> kebab-case
    .replace(/[\s_]+/g, "-") // 空格和下划线转为连字符
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5-]/g, "") // 移除特殊字符，保留中文
    .replace(/-+/g, "-") // 多个连字符合并为一个
    .replace(/^-|-$/g, "") // 移除首尾连字符
    .toLowerCase();
}

/**
 * 从任务描述中解析工具集
 * 格式: "Task 1.1: 任务描述 [tools: tool1, tool2]"
 */
export function parseToolsFromDescription(description: string): {
  cleanDescription: string;
  tools: string[];
} {
  const toolsMatch = description.match(/\[tools:\s*([^\]]+)\]/);
  if (!toolsMatch || !toolsMatch[1]) {
    return { cleanDescription: description.trim(), tools: [] };
  }

  const toolsStr = toolsMatch[1];
  const tools = toolsStr
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const cleanDescription = description.replace(/\[tools:[^\]]+\]/, "").trim();

  return { cleanDescription, tools };
}

/**
 * 获取 taskDocs 存储路径
 */
export function getTaskDocsPath(taskId: string): string {
  return path.join(getTaskStoragePath(taskId), "taskDocs");
}

/**
 * 确保目录存在
 */
export function ensureDirectoryExists(directory: string): void {
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}

export function addLineNumbers(content: string, startLine = 1): string {
  return content
    .split("\n")
    .map((line, index) => `${String(startLine + index).padStart(4, " ")}| ${line}`)
    .join("\n");
}

const TASK_LIST_LINE_EXAMPLE =
  "- [ ] Task 1.1: 修改 /sandbox/packages/amigo/src/web/components/NewChatButton.tsx 中的按钮样式问题，采用低饱和主色、圆角设计，并参考 design.md 中记录的设计稿约束 [tools: readFile, editFile] [deps: Task 1.0]";

export function validateTaskListContent(content: string): string | null {
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
}

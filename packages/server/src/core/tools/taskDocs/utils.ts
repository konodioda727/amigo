import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getGlobalState } from "@/globalState";

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
  const storagePath = getGlobalState("globalStoragePath") || process.cwd();
  return path.join(storagePath, taskId, "taskDocs");
}

/**
 * 确保目录存在
 */
export function ensureDirectoryExists(directory: string): void {
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}

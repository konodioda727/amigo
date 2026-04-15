import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getTaskStoragePath } from "@/core/storage";
import { getTaskId, parseChecklist, TASK_LIST_ID_PATTERN } from "@/core/templates/checklistParser";

export type ExtractedMarkdownSection = {
  ref: string;
  heading: string;
  level: number;
  startLine: number;
  endLine: number;
  content: string;
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
 * 从任务描述中解析旧版工具配置
 * 旧格式: "Task T1: 任务描述 [tools: tool1, tool2]"
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

export function getTaskListPath(taskId: string): string {
  return path.join(getTaskStoragePath(taskId), "taskList.md");
}

export const resolveAccessibleTaskListTaskId = ({
  currentTaskId,
  parentTaskId,
  requestedTaskId,
}: {
  currentTaskId: string;
  parentTaskId?: string;
  requestedTaskId?: string;
}): { taskId?: string; error?: string } => {
  const normalizedRequestedTaskId = requestedTaskId?.trim();

  if (!normalizedRequestedTaskId || normalizedRequestedTaskId === currentTaskId) {
    return { taskId: currentTaskId };
  }

  if (parentTaskId && normalizedRequestedTaskId === parentTaskId) {
    return { taskId: parentTaskId };
  }

  if (!parentTaskId) {
    return {
      error: `当前任务没有父任务，只能访问自己的 taskList。taskId=${currentTaskId}`,
    };
  }

  return {
    error:
      `只能访问当前任务或直接父任务的 taskList。` +
      ` currentTaskId=${currentTaskId}, parentTaskId=${parentTaskId}, requestedTaskId=${normalizedRequestedTaskId}`,
  };
};

export const normalizeTaskListDeps = (deps?: string[]): string[] =>
  Array.from(
    new Set((deps || []).map((value) => value.trim().replace(/^Task\s+/i, "")).filter(Boolean)),
  );

export type NormalizedTaskListItem = {
  id: string;
  title: string;
  deps: string[];
  completed: boolean;
};

export const isValidTaskListId = (value: string): boolean =>
  new RegExp(`^${TASK_LIST_ID_PATTERN.source}$`).test(value.trim());

export const parseTaskListFile = (markdown: string): NormalizedTaskListItem[] =>
  parseChecklist(markdown).items.map((item) => {
    const match = item.description.match(
      new RegExp(`^Task\\s+(${TASK_LIST_ID_PATTERN.source})\\s*[:：]\\s*(.*)$`, "i"),
    );
    const id = match?.[1]?.trim() || "";
    const title = (match?.[2] || item.description).replace(/\[deps:[^\]]+\]\s*$/i, "").trim();
    return {
      id,
      title,
      deps: item.dependencies,
      completed: item.completed,
    };
  });

export const normalizeTaskListItems = (
  rawTasks: unknown[],
): { tasks?: NormalizedTaskListItem[]; message?: string } => {
  if (rawTasks.length === 0) {
    return {
      message: "至少要提供一条 taskList 任务。",
    };
  }

  const normalizedTasks = rawTasks.map((task) => ({
    id: String((task as { id?: unknown }).id || "").trim(),
    title: String((task as { title?: unknown }).title || "").trim(),
    deps: normalizeTaskListDeps(
      Array.isArray((task as { deps?: unknown }).deps)
        ? (task as { deps?: string[] }).deps || []
        : [],
    ),
    completed: false,
  }));

  const invalidId = normalizedTasks.find((task) => !isValidTaskListId(task.id));
  if (invalidId) {
    return {
      message:
        `taskList 中存在非法任务 ID：${invalidId.id || "(empty)"}。` +
        "请使用非空标识符，只包含字母、数字、点、下划线或连字符，例如 T1、task-a、1.1。",
    };
  }

  const invalidTitle = normalizedTasks.find((task) => !task.title);
  if (invalidTitle) {
    return {
      message: `taskList 中存在空标题任务：Task ${invalidTitle.id}`,
    };
  }

  const idCounts = new Map<string, number>();
  for (const task of normalizedTasks) {
    idCounts.set(task.id, (idCounts.get(task.id) || 0) + 1);
  }

  const duplicated = Array.from(idCounts.entries()).find(([, count]) => count > 1)?.[0];
  if (duplicated) {
    return {
      message: `taskList 中存在重复 Task ID：${duplicated}`,
    };
  }

  const knownIds = new Set(normalizedTasks.map((task) => task.id));
  const unknownDep = normalizedTasks.find((task) => task.deps.some((dep) => !knownIds.has(dep)));
  if (unknownDep) {
    const missingDep = unknownDep.deps.find((dep) => !knownIds.has(dep)) || "";
    return {
      message: `Task ${unknownDep.id} 依赖了不存在的任务：${missingDep}`,
    };
  }

  return { tasks: normalizedTasks };
};

export const buildTaskListMarkdown = (
  tasks: Array<{
    id: string;
    title: string;
    deps?: string[];
    completed?: boolean;
  }>,
): string =>
  tasks
    .map((task) => {
      const normalizedDeps = normalizeTaskListDeps(task.deps);
      const checkmark = task.completed ? "x" : " ";
      const depsText =
        normalizedDeps.length > 0
          ? normalizedDeps.map((value) => `Task ${value}`).join(", ")
          : "none";
      return `- [${checkmark}] Task ${task.id.trim()}: ${task.title.trim()} [deps: ${depsText}]`;
    })
    .join("\n");

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

export const normalizeSectionRef = (value: string): string =>
  value
    .replace(/^#+\s*/, "")
    .trim()
    .toLowerCase();

export const extractMarkdownSectionByRef = (
  content: string,
  ref: string,
): ExtractedMarkdownSection | null => {
  const lines = content.split("\n");
  const headings = lines
    .map((line, index) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (!match?.[1] || !match[2]) {
        return null;
      }
      return {
        lineIndex: index,
        level: match[1].length,
        heading: match[2].trim(),
      };
    })
    .filter(
      (
        item,
      ): item is {
        lineIndex: number;
        level: number;
        heading: string;
      } => Boolean(item),
    );

  const normalizedRef = normalizeSectionRef(ref);
  const heading = headings.find((item) => normalizeSectionRef(item.heading) === normalizedRef);
  if (!heading) {
    return null;
  }

  let endIndex = lines.length;
  for (const candidate of headings) {
    if (candidate.lineIndex <= heading.lineIndex) {
      continue;
    }
    if (candidate.level <= heading.level) {
      endIndex = candidate.lineIndex;
      break;
    }
  }

  return {
    ref: ref.startsWith("#") ? ref : `#${ref}`,
    heading: heading.heading,
    level: heading.level,
    startLine: heading.lineIndex + 1,
    endLine: endIndex,
    content: lines.slice(heading.lineIndex, endIndex).join("\n").trim(),
  };
};

const TASK_LIST_LINE_EXAMPLE =
  "- [ ] Task T1: 修改 /sandbox/packages/amigo/src/web/components/NewChatButton.tsx 中的按钮样式问题，采用低饱和主色、圆角设计，并参考 design.md 中记录的设计稿约束 [deps: Task init-repo] [designSections: #Technical Decisions, #Implementation Strategy] [files: packages/amigo/src/web/components/NewChatButton.tsx, packages/amigo/src/web/components/NewChatButton.test.tsx]";

export function validateExecutionDocContent(content: string): string | null {
  const parseResult = parseChecklist(content);
  const { items } = parseResult;

  if (items.length === 0) {
    return [
      "taskList 不是说明文，而是给 taskList(action=execute) 执行的 checklist 任务列表。",
      "至少要有一条任务，且每条都必须使用 `- [ ] Task <ID>: ... [deps: ...]` 这种格式。",
      "如果你已经知道子任务最相关的实现文件/测试文件/配置文件，默认应在 task line 上追加 `[files: ...]`，减少子任务重复读取。",
      "如仍保留旧的 `[tools: ...]` 字段，系统会忽略它，不再按任务逐条配置子任务工具。",
      `示例：${TASK_LIST_LINE_EXAMPLE}`,
    ].join("\n");
  }

  const invalidIdItems = items.filter((item) => !getTaskId(item.description));

  const idCounts = new Map<string, number>();
  for (const item of items) {
    const taskId = getTaskId(item.description);
    if (!taskId) continue;
    idCounts.set(taskId, (idCounts.get(taskId) || 0) + 1);
  }

  const duplicatedTaskIds = Array.from(idCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([taskId]) => taskId);

  if (invalidIdItems.length === 0 && duplicatedTaskIds.length === 0) {
    return null;
  }

  const invalidIdLineRefs = invalidIdItems.map((item) => `L${item.lineNumber + 1}`).join(", ");
  const duplicatedIdsText =
    duplicatedTaskIds.length > 0 ? `重复的 Task ID：${duplicatedTaskIds.join(", ")}` : "";

  return [
    "taskList 是给 taskList(action=execute) 执行的 checklist 任务列表，不是普通说明文。",
    "taskList 格式校验失败：",
    invalidIdItems.length > 0
      ? `1) 以下行缺少合法的 "Task <ID>: ..." 前缀：${invalidIdLineRefs}`
      : "",
    duplicatedIdsText ? `2) ${duplicatedIdsText}` : "",
    "若已知相关实现文件/测试文件/配置文件，默认应在 task line 上补 `[files: ...]`，把这些上下文直接传给子任务。",
    "旧的 `[tools: ...]` 字段即使保留也只会被忽略，不再用于子任务工具分配。",
    `示例：${TASK_LIST_LINE_EXAMPLE}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

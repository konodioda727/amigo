/**
 * Checklist 解析器模块
 * 提供通用的 Markdown checklist 解析和更新功能
 * 支持 `- [ ]` 和 `- [x]` 格式
 */

/**
 * Checklist 项接口
 */
export interface ChecklistItem {
  /** 原始行内容 */
  rawLine: string;
  /** 行号（从 0 开始） */
  lineNumber: number;
  /** 是否已完成 */
  completed: boolean;
  /** 任务描述（不含 checkbox） */
  description: string;
  /** 缩进级别（空格数） */
  indentLevel: number;
}

/**
 * Checklist 解析结果
 */
export interface ChecklistParseResult {
  /** 所有 checklist 项 */
  items: ChecklistItem[];
  /** 总任务数 */
  total: number;
  /** 已完成任务数 */
  completed: number;
  /** 剩余任务数 */
  remaining: number;
  /** 完成百分比 */
  percentage: number;
}

/**
 * Checklist 正则表达式
 * 匹配格式: `- [ ]` 或 `- [x]` 或 `- [X]`
 * 捕获组:
 * 1. 缩进空格
 * 2. checkbox 状态 (空格、x 或 X)
 * 3. 任务描述
 */
const CHECKLIST_PATTERN = /^(\s*)-\s+\[([ xX])\]\s+(.+)$/;

/**
 * 解析单行 checklist 项
 * @param line 行内容
 * @param lineNumber 行号
 * @returns ChecklistItem 或 null（如果不是 checklist 项）
 */
export function parseChecklistLine(line: string, lineNumber: number): ChecklistItem | null {
  const match = CHECKLIST_PATTERN.exec(line);
  if (!match) {
    return null;
  }

  const [, indent, checkmark, description] = match;
  return {
    rawLine: line,
    lineNumber,
    completed: checkmark?.toLowerCase() === "x",
    description: description?.trim() || "",
    indentLevel: indent?.length ?? 0,
  };
}

/**
 * 解析文档中的所有 checklist 项
 * @param content 文档内容
 * @returns 解析结果
 */
export function parseChecklist(content: string): ChecklistParseResult {
  const lines = content.split("\n");
  const items: ChecklistItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const item = parseChecklistLine(lines[i] || "", i);
    if (item) {
      items.push(item);
    }
  }

  const total = items.length;
  const completed = items.filter((item) => item.completed).length;
  const remaining = total - completed;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    items,
    total,
    completed,
    remaining,
    percentage,
  };
}

/**
 * 验证字符串是否为有效的 checklist 项格式
 * @param line 行内容
 * @returns 是否为有效的 checklist 项
 */
export function isValidChecklistItem(line: string): boolean {
  return CHECKLIST_PATTERN.test(line);
}

/**
 * 根据描述查找 checklist 项
 * @param content 文档内容
 * @param description 任务描述（支持部分匹配）
 * @returns 匹配的 checklist 项数组
 */
export function findChecklistItemsByDescription(
  content: string,
  description: string,
): ChecklistItem[] {
  const result = parseChecklist(content);
  const searchLower = description.toLowerCase();
  return result.items.filter((item) => item.description.toLowerCase().includes(searchLower));
}

/**
 * 根据行号查找 checklist 项
 * @param content 文档内容
 * @param lineNumber 行号
 * @returns ChecklistItem 或 null
 */
export function findChecklistItemByLineNumber(
  content: string,
  lineNumber: number,
): ChecklistItem | null {
  const result = parseChecklist(content);
  return result.items.find((item) => item.lineNumber === lineNumber) ?? null;
}

/**
 * 更新指定行号的 checklist 项状态
 * @param content 文档内容
 * @param lineNumber 行号
 * @param completed 是否完成
 * @returns 更新后的文档内容
 */
export function updateChecklistItemByLineNumber(
  content: string,
  lineNumber: number,
  completed: boolean,
): string {
  const lines = content.split("\n");

  if (lineNumber < 0 || lineNumber >= lines.length) {
    return content;
  }

  const line = lines[lineNumber];
  const item = parseChecklistLine(line || "", lineNumber);

  if (!item) {
    return content;
  }

  const newCheckmark = completed ? "x" : " ";
  const indent = " ".repeat(item.indentLevel);
  lines[lineNumber] = `${indent}- [${newCheckmark}] ${item.description}`;

  return lines.join("\n");
}

/**
 * 根据描述更新 checklist 项状态（更新第一个匹配项）
 * @param content 文档内容
 * @param description 任务描述（精确匹配）
 * @param completed 是否完成
 * @returns 更新后的文档内容
 */
export function updateChecklistItemByDescription(
  content: string,
  description: string,
  completed: boolean,
): string {
  const result = parseChecklist(content);
  const item = result.items.find((i) => i.description === description);

  if (!item) {
    return content;
  }

  return updateChecklistItemByLineNumber(content, item.lineNumber, completed);
}

/**
 * 批量更新 checklist 项状态
 * @param content 文档内容
 * @param updates 更新列表，每项包含行号和完成状态
 * @returns 更新后的文档内容
 */
export function batchUpdateChecklistItems(
  content: string,
  updates: Array<{ lineNumber: number; completed: boolean }>,
): string {
  let updatedContent = content;

  // 按行号降序排序，从后往前更新，避免行号偏移
  const sortedUpdates = [...updates].sort((a, b) => b.lineNumber - a.lineNumber);

  for (const update of sortedUpdates) {
    updatedContent = updateChecklistItemByLineNumber(
      updatedContent,
      update.lineNumber,
      update.completed,
    );
  }

  return updatedContent;
}

/**
 * 更新文档中的进度统计部分
 * 查找并更新 Progress 部分的统计数据
 * @param content 文档内容
 * @returns 更新后的文档内容
 */
export function updateProgressSection(content: string): string {
  const progress = parseChecklist(content);

  let updatedContent = content;

  // 更新 Total 行
  updatedContent = updatedContent.replace(
    /^-\s+Total:\s*\d+\s*tasks?$/m,
    `- Total: ${progress.total} tasks`,
  );

  // 更新 Completed 行
  updatedContent = updatedContent.replace(
    /^-\s+Completed:\s*\d+\s*tasks?$/m,
    `- Completed: ${progress.completed} tasks`,
  );

  // 更新 Remaining 行
  updatedContent = updatedContent.replace(
    /^-\s+Remaining:\s*\d+\s*tasks?$/m,
    `- Remaining: ${progress.remaining} tasks`,
  );

  return updatedContent;
}

/**
 * 更新 checklist 项并同步更新进度统计
 * @param content 文档内容
 * @param lineNumber 行号
 * @param completed 是否完成
 * @returns 更新后的文档内容
 */
export function updateChecklistWithProgress(
  content: string,
  lineNumber: number,
  completed: boolean,
): string {
  const updatedContent = updateChecklistItemByLineNumber(content, lineNumber, completed);
  return updateProgressSection(updatedContent);
}

/**
 * 获取所有未完成的 checklist 项
 * @param content 文档内容
 * @returns 未完成的 checklist 项数组
 */
export function getPendingItems(content: string): ChecklistItem[] {
  const result = parseChecklist(content);
  return result.items.filter((item) => !item.completed);
}

/**
 * 获取所有已完成的 checklist 项
 * @param content 文档内容
 * @returns 已完成的 checklist 项数组
 */
export function getCompletedItems(content: string): ChecklistItem[] {
  const result = parseChecklist(content);
  return result.items.filter((item) => item.completed);
}

/**
 * 检查所有 checklist 项是否都已完成
 * @param content 文档内容
 * @returns 是否全部完成
 */
export function isAllCompleted(content: string): boolean {
  const result = parseChecklist(content);
  return result.total > 0 && result.completed === result.total;
}

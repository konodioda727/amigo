import { buildListFilesTree } from "@/core/tools/listFilesTree";
import { logger } from "@/utils/logger";

const BROWSER_SEARCH_RESULT_PREVIEW_COUNT = 8;
const BROWSER_SEARCH_CONTENT_PREVIEW_LENGTH = 1200;

interface ToolContent {
  toolName: string;
  params: unknown;
  toolCallId?: string;
  result?: unknown;
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const compactBrowserSearchResult = (result: unknown): unknown => {
  const record = asRecord(result);
  if (!record) {
    return result;
  }

  const rawResults = Array.isArray(record.results) ? record.results : [];
  const compactResults = rawResults.slice(0, BROWSER_SEARCH_RESULT_PREVIEW_COUNT).map((item) => {
    const row = asRecord(item);
    if (!row) {
      return item;
    }

    const compactRow: Record<string, unknown> = {};
    if (typeof row.title === "string") {
      compactRow.title = row.title;
    }
    if (typeof row.url === "string") {
      compactRow.url = row.url;
    }
    if (typeof row.snippet === "string") {
      compactRow.snippet = row.snippet;
    }
    if (typeof row.error === "string" && row.error) {
      compactRow.error = row.error;
    }
    if (typeof row.content === "string" && row.content) {
      compactRow.contentPreview =
        row.content.length > BROWSER_SEARCH_CONTENT_PREVIEW_LENGTH
          ? `${row.content.slice(0, BROWSER_SEARCH_CONTENT_PREVIEW_LENGTH)}...`
          : row.content;
      compactRow.contentLength = row.content.length;
    }

    return compactRow;
  });

  const failureCount = rawResults.filter((item) => {
    const row = asRecord(item);
    return !!(row && typeof row.error === "string" && row.error);
  }).length;
  const successCount = rawResults.length - failureCount;

  return {
    content: typeof record.content === "string" ? record.content : "",
    title: typeof record.title === "string" ? record.title : "",
    url: typeof record.url === "string" ? record.url : "",
    totalResults: rawResults.length,
    successCount,
    failureCount,
    results: compactResults,
    omittedResults: Math.max(0, rawResults.length - BROWSER_SEARCH_RESULT_PREVIEW_COUNT),
  };
};

const compactReadDesignDocResult = (result: unknown): unknown => {
  const record = asRecord(result);
  if (!record) {
    return result;
  }

  const compactResult: Record<string, unknown> = {};

  if (typeof record.success === "boolean") {
    compactResult.success = record.success;
  }
  if (typeof record.pageId === "string") {
    compactResult.pageId = record.pageId;
  }
  if (typeof record.content === "string") {
    compactResult.content = record.content;
  }
  if (Array.isArray(record.availableDocs)) {
    compactResult.availableDocs = record.availableDocs;
  }
  if (Array.isArray(record.validationErrors)) {
    compactResult.validationErrors = record.validationErrors;
  }
  if (typeof record.message === "string") {
    compactResult.message = record.message;
  }
  if (record.summary) {
    compactResult.summary = record.summary;
  }

  return compactResult;
};

const compactListFilesResult = (result: unknown): unknown => {
  const record = asRecord(result);
  if (!record) {
    return result;
  }

  const compactResult: Record<string, unknown> = {};
  const directoryPath =
    typeof record.directoryPath === "string" && record.directoryPath.trim()
      ? record.directoryPath
      : ".";
  const entries = Array.isArray(record.entries) ? record.entries : [];
  const tree =
    typeof record.tree === "string" && record.tree.trim()
      ? record.tree
      : buildListFilesTree(directoryPath, entries as never);

  if (typeof record.success === "boolean") {
    compactResult.success = record.success;
  }
  compactResult.directoryPath = directoryPath;
  compactResult.tree = tree;
  compactResult.entryCount = entries.length;
  if (typeof record.truncated === "boolean") {
    compactResult.truncated = record.truncated;
  }
  if (typeof record.maxDepth === "number") {
    compactResult.maxDepth = record.maxDepth;
  }
  if (typeof record.includeHidden === "boolean") {
    compactResult.includeHidden = record.includeHidden;
  }
  if (typeof record.maxEntries === "number") {
    compactResult.maxEntries = record.maxEntries;
  }
  if (typeof record.message === "string") {
    compactResult.message = record.message;
  }

  return compactResult;
};

const formatListFilesResultAsText = (result: unknown): string | null => {
  const compact = asRecord(compactListFilesResult(result));
  if (!compact) {
    return null;
  }

  const directoryPath =
    typeof compact.directoryPath === "string" && compact.directoryPath.trim()
      ? compact.directoryPath
      : ".";
  const tree = typeof compact.tree === "string" ? compact.tree.trim() : "";
  const lines = [`toolName: listFiles`, `directoryPath: ${directoryPath}`];

  if (typeof compact.message === "string" && compact.message.trim()) {
    lines.push(`message: ${compact.message.trim()}`);
  }
  if (typeof compact.truncated === "boolean") {
    lines.push(`truncated: ${compact.truncated ? "true" : "false"}`);
  }
  if (typeof compact.entryCount === "number") {
    lines.push(`entryCount: ${compact.entryCount}`);
  }
  lines.push("tree:");
  lines.push(tree || `${directoryPath === "." ? "." : directoryPath}/`);
  return lines.join("\n");
};

const stripTransientResultFields = (result: unknown): unknown => {
  const record = asRecord(result);
  if (!record) {
    return result;
  }

  if (!("websocketOnly" in record)) {
    return result;
  }

  const { websocketOnly: _websocketOnly, ...memorySafeResult } = record;
  return memorySafeResult;
};

const stripTopLevelMessageField = (result: unknown): unknown => {
  const record = asRecord(result);
  if (!record || !("message" in record)) {
    return result;
  }

  const { message: _message, ...rest } = record;
  return rest;
};

export const normalizeToolResultForMemory = (toolName: string, result: unknown): unknown => {
  const memorySafeResult = stripTransientResultFields(result);
  if (toolName === "browserSearch") {
    return compactBrowserSearchResult(memorySafeResult);
  }
  if (toolName === "readDesignDoc") {
    return compactReadDesignDocResult(memorySafeResult);
  }
  if (toolName === "listFiles") {
    return compactListFilesResult(memorySafeResult);
  }
  return memorySafeResult;
};

export const summarizeToolResultStatusForMemory = (
  toolName: string,
  result: unknown,
): string | null => {
  const record = asRecord(result);
  if (!record) {
    return null;
  }

  if (toolName === "bash" && typeof record.exitCode === "number") {
    return `命令已执行（退出码: ${record.exitCode}）`;
  }

  if (typeof record.success === "boolean") {
    return record.success ? "执行成功" : "执行失败";
  }

  if (typeof record.status === "string") {
    const normalized = record.status.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (["started", "already_running", "running"].includes(normalized)) {
      return "正在执行";
    }
    if (["completed", "success", "passed", "not_required"].includes(normalized)) {
      return "执行成功";
    }
    if (["failed", "error", "timeout", "blocked"].includes(normalized)) {
      return "执行失败";
    }
  }

  if (typeof record.overallStatus === "string") {
    const normalized = record.overallStatus.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (["running"].includes(normalized)) {
      return "正在执行";
    }
    if (["passed", "success", "completed"].includes(normalized)) {
      return "执行成功";
    }
    if (["failed", "error", "timeout", "blocked", "partial"].includes(normalized)) {
      return "执行失败";
    }
  }

  return null;
};

export const normalizeToolResultForContinuationMemory = (
  toolName: string,
  result: unknown,
): unknown => normalizeToolResultForMemory(toolName, stripTopLevelMessageField(result));

export const shouldIncludeToolMessageInContinuationMemory = (
  result: unknown,
  message: string,
): boolean => {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
    return false;
  }

  const record = asRecord(stripTransientResultFields(result));
  if (!record) {
    return true;
  }

  const { message: _message, ...rest } = record;
  return Object.keys(rest).length === 0;
};

export const buildAssistantMemoryToolContent = (
  toolName: string,
  params: unknown,
  toolCallId: string | undefined,
  result: unknown,
): string => {
  const memorySafeResult = normalizeToolResultForMemory(toolName, result);

  if (toolName !== "browserSearch") {
    return JSON.stringify({
      result: memorySafeResult,
      params,
      toolName,
      toolCallId,
    } satisfies ToolContent);
  }

  const compactResult = compactBrowserSearchResult(memorySafeResult);
  const compactRecord = asRecord(compactResult) || {};
  const summary = {
    content: typeof compactRecord.content === "string" ? compactRecord.content : "",
    totalResults:
      typeof compactRecord.totalResults === "number" ? compactRecord.totalResults : undefined,
    successCount:
      typeof compactRecord.successCount === "number" ? compactRecord.successCount : undefined,
    failureCount:
      typeof compactRecord.failureCount === "number" ? compactRecord.failureCount : undefined,
  };

  return JSON.stringify({
    result: summary,
    params,
    toolName,
    toolCallId,
  } satisfies ToolContent);
};

export const serializeToolResultForMemory = (toolName: string, result: unknown): string => {
  try {
    if (toolName === "listFiles") {
      return formatListFilesResultAsText(result) || String(result);
    }
    const normalized = normalizeToolResultForMemory(toolName, result);
    const serialized = JSON.stringify(normalized, null, 2);
    if (typeof serialized !== "string") {
      return String(normalized);
    }
    const maxLength =
      toolName === "browserSearch"
        ? 60_000
        : toolName === "readDesignDoc" ||
            toolName === "readFile" ||
            toolName === "readRules" ||
            toolName === "readSkillBundle"
          ? 120_000
          : 20_000;
    if (serialized.length <= maxLength) {
      return serialized;
    }
    return `${serialized.slice(0, maxLength)}\n...（已截断，共 ${serialized.length} 字符）`;
  } catch (error) {
    logger.warn("[ToolExecutor] 序列化工具结果失败，将使用字符串兜底:", error);
    return String(result);
  }
};

export const serializeToolResultForContinuationMemory = (
  toolName: string,
  result: unknown,
): string => {
  try {
    if (toolName === "listFiles") {
      return formatListFilesResultAsText(stripTopLevelMessageField(result)) || String(result);
    }
    const normalized = normalizeToolResultForContinuationMemory(toolName, result);
    const serialized = JSON.stringify(normalized, null, 2);
    if (typeof serialized !== "string") {
      return String(normalized);
    }
    const maxLength =
      toolName === "browserSearch"
        ? 60_000
        : toolName === "readDesignDoc" ||
            toolName === "readFile" ||
            toolName === "readRules" ||
            toolName === "readSkillBundle"
          ? 120_000
          : 20_000;
    if (serialized.length <= maxLength) {
      return serialized;
    }
    return `${serialized.slice(0, maxLength)}\n...（已截断，共 ${serialized.length} 字符）`;
  } catch (error) {
    logger.warn("[ToolExecutor] 序列化 continuation 工具结果失败，将使用字符串兜底:", error);
    return String(result);
  }
};

export const serializeListFilesResultForModel = (result: unknown): string | null =>
  formatListFilesResultAsText(result);

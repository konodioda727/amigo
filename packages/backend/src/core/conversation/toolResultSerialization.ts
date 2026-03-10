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

export const normalizeToolResultForMemory = (toolName: string, result: unknown): unknown => {
  const memorySafeResult = stripTransientResultFields(result);
  if (toolName === "browserSearch") {
    return compactBrowserSearchResult(memorySafeResult);
  }
  if (toolName === "readDesignDoc") {
    return compactReadDesignDocResult(memorySafeResult);
  }
  return memorySafeResult;
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
    const normalized = normalizeToolResultForMemory(toolName, result);
    const serialized = JSON.stringify(normalized, null, 2);
    const maxLength =
      toolName === "browserSearch"
        ? 60_000
        : toolName === "readDesignDoc" || toolName === "readFile"
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

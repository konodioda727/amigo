import type {
  EditFileDiagnostics,
  EditFileOperationInput,
  EditFileResult,
  EditFileSingleResult,
} from "@amigo-llm/types";
import type { Sandbox } from "@/core/sandbox";
import { getGlobalState } from "@/globalState";
import { logger } from "@/utils/logger";
import { createTool } from "./base";
import type { EditFileDiagnosticsProvider } from "./editFileDiagnostics";
import { createToolResult } from "./result";

/**
 * 转义 shell 特殊字符，使用 base64 编码来安全传输内容
 */
function escapeShellContent(content: string): string {
  return Buffer.from(content, "utf-8").toString("base64");
}

function previewContent(content: string | undefined, maxChars = 12000): string | undefined {
  if (content === undefined) {
    return undefined;
  }
  if (content.length <= maxChars) {
    return content;
  }
  return `${content.slice(0, maxChars)}\n...（已截断，共 ${content.length} 字符）`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function parseLineNumber(value: unknown): number {
  if (typeof value === "number") {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    return Number.parseInt(value, 10);
  }
  return Number.NaN;
}

export interface EditFileWebsocketData {
  beforeContent?: string;
  afterContent?: string;
}

export interface EditFilePreview {
  websocketData?: EditFileWebsocketData;
}

type EditFileRequest = EditFileOperationInput & {
  expectedOriginalContent?: string;
};

type EditFileOperation =
  | {
      kind: "write";
      newString: string;
    }
  | {
      kind: "searchReplace";
      oldString: string;
      newString: string;
      startLine?: number;
      endLine?: number;
    };

function buildEditFileWebsocketData(
  beforeContent: string | undefined,
  afterContent: string | undefined,
): EditFileWebsocketData | undefined {
  const preview = {
    beforeContent: previewContent(beforeContent),
    afterContent: previewContent(afterContent),
  };

  if (preview.beforeContent === undefined && preview.afterContent === undefined) {
    return undefined;
  }

  return preview;
}

function summarizeLinesWritten(operation: EditFileOperation): number {
  switch (operation.kind) {
    case "write":
      return operation.newString.split("\n").length;
    case "searchReplace":
      return operation.newString.split("\n").length;
  }
}

function resolveEditFileOperation(params: {
  content?: unknown;
  startLine?: unknown;
  endLine?: unknown;
  expectedOriginalContent?: unknown;
  oldString?: unknown;
  newString?: unknown;
}): { operation?: EditFileOperation; error?: string } {
  const hasContent = params.content !== undefined;
  const hasStartLine = params.startLine !== undefined;
  const hasEndLine = params.endLine !== undefined;
  const hasExpectedOriginalContent = params.expectedOriginalContent !== undefined;
  const hasOldString = params.oldString !== undefined;
  const hasNewString = params.newString !== undefined;
  const usesSearchReplace = hasOldString && hasNewString;

  if (hasOldString && !hasNewString) {
    return {
      error: "提供 oldString 时必须同时提供 newString",
    };
  }

  if (hasExpectedOriginalContent) {
    return {
      error:
        "editFile 不再支持 expectedOriginalContent。局部修改请使用 oldString/newString，startLine/endLine 仅作 oldString 的定位提示。",
    };
  }

  const parsedStartLine = hasStartLine ? parseLineNumber(params.startLine) : undefined;
  const parsedEndLine = hasEndLine ? parseLineNumber(params.endLine) : undefined;

  if (hasStartLine && (!Number.isFinite(parsedStartLine) || (parsedStartLine ?? 0) <= 0)) {
    return {
      error: "startLine 必须是 >= 1 的整数",
    };
  }

  if (hasEndLine && (!Number.isFinite(parsedEndLine) || (parsedEndLine ?? 0) <= 0)) {
    return {
      error: "endLine 必须是 >= 1 的整数",
    };
  }

  if (
    Number.isFinite(parsedStartLine) &&
    Number.isFinite(parsedEndLine) &&
    (parsedEndLine as number) < (parsedStartLine as number)
  ) {
    return {
      error: "endLine 必须大于等于 startLine",
    };
  }

  if (usesSearchReplace) {
    if (hasContent) {
      return {
        error:
          "editFile 不再支持 content。整文件写入请只传 newString；局部修改请使用 oldString/newString，startLine/endLine 仅作 oldString 的定位提示。",
      };
    }

    if (typeof params.oldString !== "string" || params.oldString.length === 0) {
      return {
        error: "精确替换需要提供非空的 oldString",
      };
    }

    if (typeof params.newString !== "string") {
      return {
        error: "精确替换需要提供 newString",
      };
    }

    if (params.oldString === params.newString) {
      return {
        error: "oldString 和 newString 不能完全相同",
      };
    }

    return {
      operation: {
        kind: "searchReplace",
        oldString: params.oldString,
        newString: params.newString,
        startLine: parsedStartLine as number,
        ...(parsedEndLine !== undefined ? { endLine: parsedEndLine } : {}),
      },
    };
  }

  if (hasNewString) {
    if (hasContent) {
      return {
        error:
          "editFile 不再支持 content。整文件写入请只传 newString；局部修改请使用 oldString/newString，startLine/endLine 仅作 oldString 的定位提示。",
      };
    }

    if (hasStartLine || hasEndLine) {
      return {
        error:
          "editFile 不再支持按行替换。若只传 newString，则表示整文件写入；局部修改请同时提供 oldString/newString。",
      };
    }

    return {
      operation: {
        kind: "write",
        newString: params.newString,
      },
    };
  }

  if (hasStartLine || hasEndLine) {
    return {
      error:
        "editFile 不再支持按行替换。局部修改请使用 oldString/newString，startLine/endLine 仅作 oldString 的定位提示。",
    };
  }

  if (typeof params.content !== "string") {
    return {
      error:
        "editFile 需要提供 newString。整文件写入请只传 newString；局部修改请使用 oldString/newString，可选传 startLine/endLine 作为定位提示。",
    };
  }

  return {
    error:
      "editFile 不再支持 content。整文件写入请只传 newString；局部修改请使用 oldString/newString，startLine/endLine 仅作 oldString 的定位提示。",
  };
}

function normalizeEditFileRequests(params: {
  filePath?: unknown;
  startLine?: unknown;
  endLine?: unknown;
  expectedOriginalContent?: unknown;
  oldString?: unknown;
  newString?: unknown;
  edits?: unknown;
}): { requests?: EditFileRequest[]; error?: string } {
  if (Array.isArray(params.edits)) {
    if (params.edits.length === 0) {
      return { error: "edits 不能为空" };
    }

    const requests: EditFileRequest[] = [];
    for (const [index, edit] of params.edits.entries()) {
      if (!edit || typeof edit !== "object" || Array.isArray(edit)) {
        return { error: `edits[${index}] 必须是对象` };
      }

      requests.push(edit as EditFileRequest);
    }
    return { requests };
  }

  return {
    requests: [
      {
        filePath: params.filePath as string,
        ...(params.startLine !== undefined ? { startLine: params.startLine as number } : {}),
        ...(params.endLine !== undefined ? { endLine: params.endLine as number } : {}),
        ...(params.expectedOriginalContent !== undefined
          ? { expectedOriginalContent: params.expectedOriginalContent as string }
          : {}),
        ...(params.oldString !== undefined ? { oldString: params.oldString as string } : {}),
        ...(params.newString !== undefined ? { newString: params.newString as string } : {}),
      },
    ],
  };
}

type SearchMatch = {
  startIndex: number;
  endIndex: number;
  startLine: number;
  endLine: number;
};

function buildLineStartOffsets(content: string): number[] {
  const offsets = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function resolveLineNumber(offsets: number[], index: number): number {
  let left = 0;
  let right = offsets.length - 1;

  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    const offset = offsets[middle];
    if (offset === undefined) {
      break;
    }
    if (offset <= index) {
      left = middle + 1;
    } else {
      right = middle - 1;
    }
  }

  return Math.max(1, right + 1);
}

function collectSearchMatches(content: string, needle: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const lineStartOffsets = buildLineStartOffsets(content);
  const step = Math.max(needle.length, 1);
  let fromIndex = 0;

  while (fromIndex <= content.length) {
    const startIndex = content.indexOf(needle, fromIndex);
    if (startIndex < 0) {
      break;
    }
    const endIndex = startIndex + needle.length;
    matches.push({
      startIndex,
      endIndex,
      startLine: resolveLineNumber(lineStartOffsets, startIndex),
      endLine: resolveLineNumber(lineStartOffsets, Math.max(startIndex, endIndex - 1)),
    });
    fromIndex = startIndex + step;
  }

  return matches;
}

function computeAnchorDistance(match: SearchMatch, anchorLine: number): number {
  if (anchorLine >= match.startLine && anchorLine <= match.endLine) {
    return 0;
  }
  return Math.min(Math.abs(match.startLine - anchorLine), Math.abs(match.endLine - anchorLine));
}

function selectSearchReplaceMatch(
  matches: SearchMatch[],
  operation: Extract<EditFileOperation, { kind: "searchReplace" }>,
): { match?: SearchMatch; error?: string } {
  if (matches.length === 0) {
    return {
      error:
        "精确替换失败：oldString 未在文件中命中。请先 readFile，确保传入完整且精确的原文片段。",
    };
  }

  if (typeof operation.startLine === "number" && typeof operation.endLine === "number") {
    const { startLine, endLine } = operation;
    const inRange = matches.filter(
      (match) => match.endLine >= startLine && match.startLine <= endLine,
    );

    if (inRange.length === 0) {
      return {
        error: `精确替换失败：oldString 未在第 ${startLine}-${endLine} 行范围内命中。请调整定位提示或提供更精确的 oldString。`,
      };
    }

    if (inRange.length > 1) {
      return {
        error: `精确替换失败：oldString 在第 ${startLine}-${endLine} 行范围内命中 ${inRange.length} 次，无法唯一定位。请提供更长的 oldString。`,
      };
    }

    return { match: inRange[0] };
  }

  if (typeof operation.startLine === "number") {
    const { startLine } = operation;
    const nearestDistance = Math.min(
      ...matches.map((match) => computeAnchorDistance(match, startLine)),
    );
    const nearest = matches.filter(
      (match) => computeAnchorDistance(match, startLine) === nearestDistance,
    );

    if (nearest.length > 1) {
      return {
        error: `精确替换失败：oldString 在第 ${startLine} 行附近存在 ${nearest.length} 个同等接近的命中，无法唯一定位。请补充 endLine 或提供更长的 oldString。`,
      };
    }

    return { match: nearest[0] };
  }

  if (typeof operation.endLine === "number") {
    const { endLine } = operation;
    const nearestDistance = Math.min(
      ...matches.map((match) => computeAnchorDistance(match, endLine)),
    );
    const nearest = matches.filter(
      (match) => computeAnchorDistance(match, endLine) === nearestDistance,
    );

    if (nearest.length > 1) {
      return {
        error: `精确替换失败：oldString 在第 ${endLine} 行附近存在 ${nearest.length} 个同等接近的命中，无法唯一定位。请补充 startLine 或提供更长的 oldString。`,
      };
    }

    return { match: nearest[0] };
  }

  if (matches.length > 1) {
    return {
      error: `精确替换失败：oldString 在文件中命中 ${matches.length} 次，无法唯一定位。请提供更长的上下文使其唯一。`,
    };
  }

  return { match: matches[0] };
}

function applySearchReplace(
  originalContent: string,
  operation: Extract<EditFileOperation, { kind: "searchReplace" }>,
): { updatedContent?: string; error?: string } {
  const { match, error } = selectSearchReplaceMatch(
    collectSearchMatches(originalContent, operation.oldString),
    operation,
  );

  if (!match) {
    return {
      error: error || "精确替换失败",
    };
  }

  return {
    updatedContent:
      originalContent.slice(0, match.startIndex) +
      operation.newString +
      originalContent.slice(match.endIndex),
  };
}

export const normalizeEditFilePath = (filePath: string): string =>
  filePath.trim().replace(/^(\.\/)+/, "");

const runConfiguredEditFileDiagnostics = async (params: {
  taskId: string;
  parentId?: string;
  conversationContext?: unknown;
  sandbox: Sandbox;
  filePath: string;
  beforeContent?: string;
  afterContent: string;
  signal?: AbortSignal;
}): Promise<EditFileDiagnostics | undefined> => {
  const provider = getGlobalState("editFileDiagnosticsProvider") as
    | EditFileDiagnosticsProvider
    | undefined;
  if (!provider) {
    return undefined;
  }

  try {
    return await provider(params);
  } catch (error) {
    logger.warn(
      `[EditFile] 运行编辑后诊断失败 ${params.filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return undefined;
  }
};

const buildEditFileTransportMessage = (
  successMsg: string,
  diagnostics?: EditFileDiagnostics,
): string => {
  if (!diagnostics || diagnostics.status === "clean") {
    return successMsg;
  }

  return `${successMsg}；${diagnostics.summary}`;
};

const buildEditFileContinuationSummary = (filePath: string): string => `【已修改 ${filePath}】`;

const buildEditFileContinuationResult = (params: {
  success: boolean;
  status?: "success" | "partial_success" | "failed";
  filePath: string;
  message: string;
  failureReason?: string;
  linesWritten?: number;
  diagnostics?: EditFileDiagnostics;
}) => ({
  success: params.success,
  ...(params.status ? { status: params.status } : {}),
  filePath: params.filePath,
  message: params.message,
  ...(params.failureReason ? { failureReason: params.failureReason } : {}),
  ...(typeof params.linesWritten === "number" ? { linesWritten: params.linesWritten } : {}),
  ...(params.diagnostics ? { diagnostics: params.diagnostics } : {}),
});

const buildBatchEditSummary = (fileResults: EditFileSingleResult[]): string => {
  const successResults = fileResults.filter((result) => result.success);
  const failedResults = fileResults.filter((result) => !result.success);

  const summaryParts = [`成功 ${successResults.length} 个`, `失败 ${failedResults.length} 个`];

  const failedPreview = failedResults
    .slice(0, 3)
    .map(
      (result) => `${result.filePath}（${result.failureReason || result.message || "编辑失败"}）`,
    );

  return failedPreview.length > 0
    ? `批量编辑完成：${summaryParts.join("，")}。失败文件：${failedPreview.join("；")}`
    : `成功批量修改 ${successResults.length} 个文件`;
};

async function loadFileContent(
  sandbox: Sandbox,
  cleanPath: string,
): Promise<{ exists: boolean; content?: string }> {
  const existsResult = await sandbox.runCommand(
    `test -f ${shellQuote(cleanPath)} && echo "exists" || echo "not_found"`,
  );
  const exists = !!existsResult?.includes("exists");
  if (!exists) {
    return { exists: false };
  }

  return {
    exists: true,
    content: (await sandbox.runCommand(`cat ${shellQuote(cleanPath)}`)) || "",
  };
}

function applyEditOperationToContent(
  cleanPath: string,
  operation: EditFileOperation,
  currentContent: string | undefined,
): { updatedContent?: string; error?: string } {
  if (operation.kind === "write") {
    return { updatedContent: operation.newString };
  }

  if (currentContent === undefined) {
    return {
      error: `文件不存在: ${cleanPath}。精确替换只能用于已有文件；新建文件请改用整文件写入`,
    };
  }

  return applySearchReplace(currentContent, operation);
}

async function writeFileContent(
  sandbox: Sandbox,
  cleanPath: string,
  content: string,
): Promise<void> {
  const base64Content = escapeShellContent(content);
  await sandbox.runCommand(
    `printf '%s' ${shellQuote(base64Content)} | base64 -d > ${shellQuote(cleanPath)}`,
  );
}

async function executeFileEdits(params: {
  sandbox: Sandbox;
  context: {
    taskId: string;
    parentId?: string;
    conversationContext?: unknown;
    signal?: AbortSignal;
  };
  cleanPath: string;
  operations: EditFileOperation[];
}): Promise<{
  success: boolean;
  result: EditFileSingleResult;
  websocketData?: EditFileWebsocketData;
}> {
  const { sandbox, context, cleanPath, operations } = params;
  const dirPath = cleanPath.includes("/") ? cleanPath.substring(0, cleanPath.lastIndexOf("/")) : "";
  if (dirPath) {
    await sandbox.runCommand(`mkdir -p ${shellQuote(dirPath)}`);
  }

  const loaded = await loadFileContent(sandbox, cleanPath);
  const originalContent = loaded.content;
  let workingContent = originalContent;
  let totalLinesWritten = 0;

  for (const operation of operations) {
    const { updatedContent, error } = applyEditOperationToContent(
      cleanPath,
      operation,
      workingContent,
    );
    if (updatedContent === undefined) {
      return {
        success: false,
        result: {
          success: false,
          filePath: cleanPath,
          message: error || "编辑失败",
          failureReason: error || "编辑失败",
        },
      };
    }
    workingContent = updatedContent;
    totalLinesWritten += summarizeLinesWritten(operation);
  }

  await writeFileContent(sandbox, cleanPath, workingContent ?? "");

  const diagnostics = await runConfiguredEditFileDiagnostics({
    taskId: context.taskId,
    parentId: context.parentId,
    conversationContext: context.conversationContext,
    sandbox,
    filePath: cleanPath,
    beforeContent: originalContent,
    afterContent: workingContent ?? "",
    signal: context.signal,
  });

  const result: EditFileSingleResult = {
    success: true,
    filePath: cleanPath,
    message:
      operations.length === 1
        ? operations[0]?.kind === "write"
          ? `成功写入文件: ${cleanPath}（共 ${totalLinesWritten} 行）`
          : `成功精确替换文件 ${cleanPath} 中唯一定位的文本片段（共 ${totalLinesWritten} 行）`
        : `成功修改文件 ${cleanPath}（共 ${operations.length} 处编辑，累计 ${totalLinesWritten} 行）`,
    ...(totalLinesWritten > 0 ? { linesWritten: totalLinesWritten } : {}),
    ...(diagnostics ? { diagnostics } : {}),
  };

  return {
    success: true,
    result,
    websocketData: buildEditFileWebsocketData(originalContent, workingContent),
  };
}

export async function buildEditFilePreview(
  sandbox: Sandbox,
  params: {
    filePath?: string;
    startLine?: number;
    endLine?: number;
    oldString?: string;
    newString?: string;
    edits?: EditFileRequest[];
  },
): Promise<EditFilePreview> {
  const { requests } = normalizeEditFileRequests(params);
  if (!requests) {
    return {};
  }

  const grouped = new Map<string, EditFileOperation[]>();
  for (const request of requests) {
    if (typeof request.filePath !== "string" || request.filePath.trim() === "") {
      return {};
    }

    const cleanPath = normalizeEditFilePath(request.filePath);
    const { operation } = resolveEditFileOperation(request);
    if (!operation) {
      return {};
    }

    const existing = grouped.get(cleanPath) ?? [];
    existing.push(operation);
    grouped.set(cleanPath, existing);
  }

  if (grouped.size !== 1) {
    return {};
  }

  const [entry] = [...grouped.entries()];
  if (!entry) {
    return {};
  }
  const [cleanPath, operations] = entry;
  const loaded = await loadFileContent(sandbox, cleanPath);
  const originalContent = loaded.content;
  let workingContent = originalContent;

  for (const operation of operations) {
    const { updatedContent } = applyEditOperationToContent(cleanPath, operation, workingContent);
    if (updatedContent === undefined) {
      return {};
    }
    workingContent = updatedContent;
  }

  return {
    websocketData: buildEditFileWebsocketData(originalContent, workingContent),
  };
}

/**
 * EditFile 工具
 * 用于在沙箱中创建或修改文件
 */
export const EditFile = createTool({
  name: "editFile",
  description:
    "唯一允许用于修改文件的工具。在沙箱中创建、覆盖或精确替换文件内容，支持单文件编辑、同文件多处顺序修改，以及在确有必要时批量修改多个文件。",
  whenToUse:
    "只要要修改文件，就使用它，不要改用 bash。整文件写入：传 filePath + newString。局部精确替换：传 filePath + oldString + newString，可选传 startLine/endLine 仅作 oldString 的定位提示。只要某一个文件或某一处修复已经明确且风险可控，就立刻用 `editFile` 先改这一处，再继续诊断或验证；不要为了凑批量修改而继续阅读其他文件。只有当多处改动彼此强耦合、并且你已经明确知道要一起怎么改时，才一次调用 `editFile` 做同文件多位置或多文件批量修改。",
  historyProfile: {
    progressKind: "write",
    getResourceKeys: ({ params }) => {
      if (Array.isArray(params.edits)) {
        return params.edits
          .map((edit) =>
            typeof edit?.filePath === "string" ? normalizeEditFilePath(edit.filePath) : "",
          )
          .filter(Boolean)
          .map((filePath) => `file:${filePath}`);
      }

      return typeof params.filePath === "string" && params.filePath.trim()
        ? [params.filePath.trim().replace(/^(\.\/)+/, "")].map((filePath) => `file:${filePath}`)
        : [];
    },
  },

  params: [
    {
      name: "edits",
      optional: true,
      type: "array",
      description:
        "可选：批量编辑列表。每项都包含 filePath 和对应编辑方式。适合一次修改多个文件，或对同一文件做多处顺序修改。",
      params: [
        {
          name: "edit",
          optional: false,
          type: "object",
          description: "单个编辑项。包含 filePath 和一种编辑方式。",
          params: [
            {
              name: "filePath",
              optional: false,
              description: "文件路径（支持相对于沙箱工作目录的路径或绝对路径）",
            },
            {
              name: "startLine",
              optional: true,
              description: "可选：起始行号（从 1 开始）。仅作为 oldString 搜索的定位提示。",
            },
            {
              name: "endLine",
              optional: true,
              description: "可选：结束行号（包含）。与 startLine 一起用于缩小 oldString 搜索范围。",
            },
            {
              name: "oldString",
              optional: true,
              description:
                "可选：对已有文件做精确文本替换时使用。默认必须唯一命中；若传 startLine/endLine，则按定位提示缩小匹配范围。",
            },
            {
              name: "newString",
              optional: false,
              description:
                "整文件写入时直接作为完整文件内容；若同时提供 oldString，则表示精确替换后的新文本。",
            },
          ],
        },
      ],
    },
    {
      name: "filePath",
      optional: true,
      description: "单文件编辑时使用的文件路径；若传 edits，则不要再传顶层 filePath",
    },
    {
      name: "startLine",
      optional: true,
      description: "可选：起始行号（从 1 开始）。仅作为 oldString 搜索的定位提示。",
    },
    {
      name: "endLine",
      optional: true,
      description: "可选：结束行号（包含）。与 startLine 一起用于缩小 oldString 搜索范围。",
    },
    {
      name: "oldString",
      optional: true,
      description:
        "可选：对已有文件做精确文本替换时使用。默认必须在文件中唯一命中；若传 startLine/endLine，则按定位提示缩小匹配范围。",
    },
    {
      name: "newString",
      optional: true,
      description:
        "整文件写入时直接作为完整文件内容；若同时提供 oldString，则表示精确替换后的新文本。",
    },
  ],

  async invoke({ params, context }) {
    const { requests, error: normalizeError } = normalizeEditFileRequests(params);

    logger.info(
      `[EditFile] invoke called with ${requests?.length ?? 0} edit request(s), top-level filePath: ${String(params.filePath)}`,
    );
    logger.info(
      `[EditFile] context.taskId: ${context.taskId}, context.parentId: ${context.parentId}`,
    );

    if (!requests) {
      const errorMsg = normalizeError || "editFile 参数无效";
      return createToolResult(
        { success: false, message: errorMsg },
        { transportMessage: errorMsg },
      );
    }

    try {
      logger.info(`[EditFile] Calling context.getSandbox()...`);
      const sandbox = (await context.getSandbox()) as Sandbox;
      logger.info(
        `[EditFile] getSandbox returned, sandbox: ${!!sandbox}, isRunning: ${sandbox?.isRunning()}`,
      );

      if (!sandbox || !sandbox.isRunning()) {
        const errorMsg = "沙箱未运行，无法编辑文件";
        return createToolResult(
          { success: false, message: errorMsg },
          { transportMessage: errorMsg },
        );
      }

      const grouped = new Map<string, EditFileOperation[]>();
      for (const request of requests) {
        if (typeof request.filePath !== "string" || request.filePath.trim() === "") {
          const errorMsg = "文件路径不能为空";
          return createToolResult(
            { success: false, message: errorMsg },
            { transportMessage: errorMsg },
          );
        }

        const cleanPath = normalizeEditFilePath(request.filePath);
        const { operation, error } = resolveEditFileOperation(request);
        if (!operation) {
          return createToolResult(
            {
              success: false,
              status: "failed",
              ...(requests.length === 1 ? { filePath: cleanPath } : {}),
              message: error || "editFile 参数无效",
            },
            {
              transportMessage: error || "editFile 参数无效",
            },
          );
        }

        const existing = grouped.get(cleanPath) ?? [];
        existing.push(operation);
        grouped.set(cleanPath, existing);
      }

      const fileResults: EditFileSingleResult[] = [];
      const previewEntries: Array<{ filePath: string; websocketData?: EditFileWebsocketData }> = [];

      for (const [cleanPath, operations] of grouped.entries()) {
        const execution = await executeFileEdits({
          sandbox,
          context: {
            taskId: context.taskId,
            parentId: context.parentId,
            conversationContext: context.conversationContext,
            signal: context.signal,
          },
          cleanPath,
          operations,
        });

        fileResults.push(execution.result);
        if (execution.success) {
          logger.info(`[EditFile] ${execution.result.message}`);
          previewEntries.push({ filePath: cleanPath, websocketData: execution.websocketData });
        } else {
          logger.warn(`[EditFile] ${execution.result.message}`);
        }
      }

      if (fileResults.length === 1) {
        const [single] = fileResults;
        const preview = previewEntries[0]?.websocketData;
        if (!single) {
          throw new Error("single edit result missing");
        }
        return createToolResult(
          {
            success: single.success,
            status: single.success ? "success" : "failed",
            filePath: single.filePath,
            message: single.message,
            ...(single.failureReason ? { failureReason: single.failureReason } : {}),
            ...(typeof single.linesWritten === "number"
              ? { linesWritten: single.linesWritten }
              : {}),
            ...(single.diagnostics ? { diagnostics: single.diagnostics } : {}),
          },
          {
            transportMessage: buildEditFileTransportMessage(single.message, single.diagnostics),
            continuationSummary: buildEditFileContinuationSummary(single.filePath),
            continuationResult: buildEditFileContinuationResult({
              success: single.success,
              status: single.success ? "success" : "failed",
              filePath: single.filePath,
              message: single.message,
              failureReason: single.failureReason,
              linesWritten: single.linesWritten,
              diagnostics: single.diagnostics,
            }),
            ...(preview ? { websocketData: preview } : {}),
          },
        );
      }

      const successResults = fileResults.filter((fileResult) => fileResult.success);
      const failedResults = fileResults.filter((fileResult) => !fileResult.success);
      const totalLinesWritten = fileResults.reduce(
        (sum, fileResult) => sum + (fileResult.linesWritten ?? 0),
        0,
      );
      const status: EditFileResult["status"] =
        failedResults.length === 0
          ? "success"
          : successResults.length === 0
            ? "failed"
            : "partial_success";
      const summaryMessage = buildBatchEditSummary(fileResults);
      const transportResult: EditFileResult = {
        success: successResults.length > 0,
        status,
        message:
          totalLinesWritten > 0
            ? `${summaryMessage}（累计 ${totalLinesWritten} 行）`
            : summaryMessage,
        edits: fileResults,
      };

      return createToolResult(transportResult, {
        transportMessage: transportResult.message,
        continuationSummary:
          status === "success"
            ? `【已批量修改 ${successResults.length} 个文件】`
            : `【批量编辑：成功 ${successResults.length} 个，失败 ${failedResults.length} 个】`,
        continuationResult: transportResult,
      });
    } catch (error) {
      const errorMsg = `编辑文件失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`[EditFile] ${errorMsg}`);
      return createToolResult(
        {
          success: false,
          status: "failed",
          ...(requests.length === 1 && typeof requests[0]?.filePath === "string"
            ? { filePath: normalizeEditFilePath(requests[0].filePath) }
            : {}),
          message: errorMsg,
        },
        { transportMessage: errorMsg },
      );
    }
  },
});

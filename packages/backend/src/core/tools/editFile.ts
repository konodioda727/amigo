import type { EditFileDiagnostics } from "@amigo-llm/types";
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

function splitLines(content: string): string[] {
  return content.length === 0 ? [] : content.split("\n");
}

export interface EditFileWebsocketData {
  beforeContent?: string;
  afterContent?: string;
}

export interface EditFilePreview {
  websocketData?: EditFileWebsocketData;
}

type EditFileOperation =
  | {
      kind: "write";
      content: string;
    }
  | {
      kind: "searchReplace";
      oldString: string;
      newString: string;
    }
  | {
      kind: "linePatch";
      startLine: number;
      endLine: number;
      content: string;
      expectedOriginalContent: string;
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

function resolveEditFileOperation(params: {
  content?: unknown;
  startLine?: unknown;
  endLine?: unknown;
  expectedOriginalContent?: unknown;
  oldString?: unknown;
  newString?: unknown;
}): { operation?: EditFileOperation; error?: string } {
  const hasStartLine = params.startLine !== undefined;
  const hasEndLine = params.endLine !== undefined;
  const hasExpectedOriginalContent = params.expectedOriginalContent !== undefined;
  const hasOldString = params.oldString !== undefined;
  const hasNewString = params.newString !== undefined;
  const usesLinePatch = hasStartLine || hasEndLine || hasExpectedOriginalContent;
  const usesSearchReplace = hasOldString || hasNewString;

  if (usesLinePatch && usesSearchReplace) {
    return {
      error:
        "局部修改一次只能选择一种方式：要么使用 startLine/endLine/content/expectedOriginalContent，要么使用 oldString/newString",
    };
  }

  if (hasStartLine !== hasEndLine) {
    return {
      error: "按行修改需要同时提供 startLine 和 endLine",
    };
  }

  if (hasOldString !== hasNewString) {
    return {
      error: "精确替换需要同时提供 oldString 和 newString",
    };
  }

  if (usesSearchReplace) {
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
      },
    };
  }

  if (hasStartLine && hasEndLine) {
    const startLine = parseLineNumber(params.startLine);
    const endLine = parseLineNumber(params.endLine);

    if (
      !Number.isFinite(startLine) ||
      !Number.isFinite(endLine) ||
      startLine <= 0 ||
      endLine < startLine
    ) {
      return {
        error:
          "按行修改需要提供合法的 startLine 和 endLine，且 startLine >= 1、endLine >= startLine",
      };
    }

    if (typeof params.content !== "string") {
      return {
        error: "按行修改需要提供 content",
      };
    }

    if (typeof params.expectedOriginalContent !== "string") {
      return {
        error: "按行修改需要提供 expectedOriginalContent，用于校验当前文件片段仍与读取时一致",
      };
    }

    return {
      operation: {
        kind: "linePatch",
        startLine,
        endLine,
        content: params.content,
        expectedOriginalContent: params.expectedOriginalContent,
      },
    };
  }

  if (typeof params.content !== "string") {
    return {
      error:
        "整文件写入需要提供 content；如果只改局部，请提供 startLine、endLine、content 和 expectedOriginalContent，或使用 oldString/newString",
    };
  }

  return {
    operation: {
      kind: "write",
      content: params.content,
    },
  };
}

function applyLinePatch(
  originalContent: string,
  operation: Extract<EditFileOperation, { kind: "linePatch" }>,
): { updatedContent?: string; error?: string } {
  const lines = splitLines(originalContent);
  if (operation.startLine > lines.length + 1) {
    return {
      error: `startLine 超出范围，当前文件只有 ${lines.length} 行`,
    };
  }

  const currentSlice = lines
    .slice(operation.startLine - 1, Math.min(lines.length, operation.endLine))
    .join("\n");
  if (currentSlice !== operation.expectedOriginalContent) {
    return {
      error:
        "按行修改前校验失败：目标行内容已发生变化。请先重新 readFile，并基于最新内容传入 expectedOriginalContent 后再试。",
    };
  }

  const updatedContent = [
    ...lines.slice(0, operation.startLine - 1),
    ...operation.content.split("\n"),
    ...lines.slice(Math.min(lines.length, operation.endLine)),
  ].join("\n");

  return { updatedContent };
}

function applySearchReplace(
  originalContent: string,
  operation: Extract<EditFileOperation, { kind: "searchReplace" }>,
): { updatedContent?: string; error?: string } {
  const matchCount = originalContent.split(operation.oldString).length - 1;

  if (matchCount === 0) {
    return {
      error:
        "精确替换失败：oldString 未在文件中命中。请先 readFile，确保传入完整且精确的原文片段。",
    };
  }

  if (matchCount > 1) {
    return {
      error: `精确替换失败：oldString 在文件中命中 ${matchCount} 次，无法唯一定位。请提供更长的上下文使其唯一。`,
    };
  }

  return {
    updatedContent: originalContent.replace(operation.oldString, operation.newString),
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
  filePath: string;
  message: string;
  linesWritten?: number;
}) => ({
  success: params.success,
  filePath: params.filePath,
  message: params.message,
  ...(typeof params.linesWritten === "number" ? { linesWritten: params.linesWritten } : {}),
});

export async function buildEditFilePreview(
  sandbox: Sandbox,
  params: {
    filePath: string;
    content?: string;
    startLine?: number;
    endLine?: number;
    expectedOriginalContent?: string;
    oldString?: string;
    newString?: string;
  },
): Promise<EditFilePreview> {
  const cleanPath = normalizeEditFilePath(params.filePath);
  const { operation } = resolveEditFileOperation(params);
  if (!operation) {
    return {};
  }

  const existsResult = await sandbox.runCommand(
    `test -f ${shellQuote(cleanPath)} && echo "exists" || echo "not_found"`,
  );
  const fileExists = !!existsResult?.includes("exists");
  const originalContent = fileExists
    ? (await sandbox.runCommand(`cat ${shellQuote(cleanPath)}`)) || ""
    : undefined;

  if (operation.kind === "write") {
    return {
      websocketData: buildEditFileWebsocketData(originalContent, operation.content),
    };
  }

  if (originalContent === undefined) {
    return {};
  }

  const { updatedContent } =
    operation.kind === "linePatch"
      ? applyLinePatch(originalContent, operation)
      : applySearchReplace(originalContent, operation);
  if (updatedContent === undefined) {
    return {};
  }

  return {
    websocketData: buildEditFileWebsocketData(originalContent, updatedContent),
  };
}

/**
 * EditFile 工具
 * 用于在沙箱中创建或修改文件
 */
export const EditFile = createTool({
  name: "editFile",
  description:
    "在沙箱中写入文件。支持整文件写入、按唯一 oldString/newString 精确替换，或基于 startLine/endLine 的受保护局部替换。",
  whenToUse:
    "需要创建文件、覆盖整个文件、做唯一文本替换，或在已知精确上下文下修改局部内容时使用。改动前先 readFile；局部修改必须携带最新原文片段用于校验；改动后建议 runChecks 验证。",
  historyProfile: {
    progressKind: "write",
    getResourceKeys: ({ params }) =>
      typeof params.filePath === "string" && params.filePath.trim()
        ? [params.filePath.trim().replace(/^(\.\/)+/, "")].map((filePath) => `file:${filePath}`)
        : [],
  },

  params: [
    {
      name: "filePath",
      optional: false,
      description: "文件路径（支持相对于沙箱工作目录的路径或绝对路径）",
    },
    {
      name: "content",
      optional: true,
      description:
        "整文件写入时必填；按行修改时需与 startLine、endLine、expectedOriginalContent 一起提供",
    },
    {
      name: "startLine",
      optional: true,
      description: "可选：起始行号（从 1 开始）。仅作为局部修改的定位提示",
    },
    {
      name: "endLine",
      optional: true,
      description: "可选：结束行号（包含）。仅作为局部修改的定位提示",
    },
    {
      name: "expectedOriginalContent",
      optional: true,
      description:
        "按行修改时必填：startLine-endLine 当前应匹配的原文片段。必须与最新 readFile 结果完全一致，不含行号。",
    },
    {
      name: "oldString",
      optional: true,
      description: "可选：对已有文件做精确文本替换时使用。必须在文件中唯一命中，并与原文完全一致。",
    },
    {
      name: "newString",
      optional: true,
      description: "可选：与 oldString 配对使用，表示替换后的新文本。",
    },
  ],

  async invoke({ params, context }) {
    const { filePath, content, startLine, endLine, expectedOriginalContent, oldString, newString } =
      params;

    logger.info(
      `[EditFile] invoke called with filePath: ${filePath}, startLine: ${String(startLine)}, endLine: ${String(endLine)}`,
    );
    logger.info(
      `[EditFile] context.taskId: ${context.taskId}, context.parentId: ${context.parentId}`,
    );

    if (!filePath || filePath.trim() === "") {
      const errorMsg = "文件路径不能为空";
      return createToolResult(
        { success: false, filePath: "", message: errorMsg },
        { transportMessage: errorMsg },
      );
    }

    const cleanPath = normalizeEditFilePath(filePath);
    const { operation, error } = resolveEditFileOperation({
      content,
      startLine,
      endLine,
      expectedOriginalContent,
      oldString,
      newString,
    });

    if (!operation) {
      return createToolResult(
        {
          success: false,
          filePath: cleanPath,
          message: error || "editFile 参数无效",
        },
        {
          transportMessage: error || "editFile 参数无效",
        },
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
          { success: false, filePath: cleanPath, message: errorMsg },
          { transportMessage: errorMsg },
        );
      }

      const dirPath = cleanPath.includes("/")
        ? cleanPath.substring(0, cleanPath.lastIndexOf("/"))
        : "";

      if (dirPath) {
        await sandbox.runCommand(`mkdir -p ${shellQuote(dirPath)}`);
      }

      const existsResult = await sandbox.runCommand(
        `test -f ${shellQuote(cleanPath)} && echo "exists" || echo "not_found"`,
      );
      const fileExists = !!existsResult?.includes("exists");
      const originalContent = fileExists
        ? (await sandbox.runCommand(`cat ${shellQuote(cleanPath)}`)) || ""
        : undefined;

      if (operation.kind === "linePatch" || operation.kind === "searchReplace") {
        if (originalContent === undefined) {
          const errorMsg =
            operation.kind === "linePatch"
              ? `文件不存在: ${cleanPath}。按行修改只能用于已有文件；新建文件时不要传 startLine 和 endLine`
              : `文件不存在: ${cleanPath}。精确替换只能用于已有文件；新建文件请改用整文件写入`;
          return createToolResult(
            { success: false, filePath: cleanPath, message: errorMsg },
            { transportMessage: errorMsg },
          );
        }

        const { updatedContent, error: patchError } =
          operation.kind === "linePatch"
            ? applyLinePatch(originalContent, operation)
            : applySearchReplace(originalContent, operation);
        if (updatedContent === undefined) {
          return createToolResult(
            {
              success: false,
              filePath: cleanPath,
              message: patchError || "按行修改失败",
            },
            {
              transportMessage: patchError || "按行修改失败",
            },
          );
        }

        const base64Content = escapeShellContent(updatedContent);
        await sandbox.runCommand(
          `printf '%s' ${shellQuote(base64Content)} | base64 -d > ${shellQuote(cleanPath)}`,
        );

        const linesWritten =
          operation.kind === "linePatch"
            ? operation.content.split("\n").length
            : operation.newString.split("\n").length;
        const successMsg =
          operation.kind === "linePatch"
            ? `成功修改文件 ${cleanPath} 的第 ${operation.startLine}-${operation.endLine} 行（共 ${linesWritten} 行）`
            : `成功精确替换文件 ${cleanPath} 中唯一命中的文本片段（共 ${linesWritten} 行）`;
        const diagnostics = await runConfiguredEditFileDiagnostics({
          taskId: context.taskId,
          parentId: context.parentId,
          conversationContext: context.conversationContext,
          sandbox,
          filePath: cleanPath,
          beforeContent: originalContent,
          afterContent: updatedContent,
          signal: context.signal,
        });
        logger.info(`[EditFile] ${successMsg}`);

        return createToolResult(
          {
            success: true,
            filePath: cleanPath,
            message: successMsg,
            linesWritten,
            ...(diagnostics ? { diagnostics } : {}),
          },
          {
            transportMessage: buildEditFileTransportMessage(successMsg, diagnostics),
            continuationSummary: buildEditFileContinuationSummary(cleanPath),
            continuationResult: buildEditFileContinuationResult({
              success: true,
              filePath: cleanPath,
              message: successMsg,
              linesWritten,
            }),
            websocketData: buildEditFileWebsocketData(originalContent, updatedContent),
          },
        );
      }

      const base64Content = escapeShellContent(operation.content);
      await sandbox.runCommand(
        `printf '%s' ${shellQuote(base64Content)} | base64 -d > ${shellQuote(cleanPath)}`,
      );

      const checkResult = await sandbox.runCommand(
        `test -f ${shellQuote(cleanPath)} && echo "exists" || echo "not_found"`,
      );
      if (!checkResult?.includes("exists")) {
        throw new Error(`文件创建失败，检查结果: ${checkResult}`);
      }

      const linesWritten = operation.content.split("\n").length;
      const successMsg = `成功写入文件: ${cleanPath}（共 ${linesWritten} 行）`;
      const diagnostics = await runConfiguredEditFileDiagnostics({
        taskId: context.taskId,
        parentId: context.parentId,
        conversationContext: context.conversationContext,
        sandbox,
        filePath: cleanPath,
        beforeContent: originalContent,
        afterContent: operation.content,
        signal: context.signal,
      });
      logger.info(`[EditFile] ${successMsg}`);

      return createToolResult(
        {
          success: true,
          filePath: cleanPath,
          message: successMsg,
          linesWritten,
          ...(diagnostics ? { diagnostics } : {}),
        },
        {
          transportMessage: buildEditFileTransportMessage(successMsg, diagnostics),
          continuationSummary: buildEditFileContinuationSummary(cleanPath),
          continuationResult: buildEditFileContinuationResult({
            success: true,
            filePath: cleanPath,
            message: successMsg,
            linesWritten,
          }),
          websocketData: buildEditFileWebsocketData(originalContent, operation.content),
        },
      );
    } catch (error) {
      const errorMsg = `编辑文件失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`[EditFile] ${errorMsg}`);
      return createToolResult(
        { success: false, filePath: cleanPath, message: errorMsg },
        { transportMessage: errorMsg },
      );
    }
  },
});

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { logger } from "@/utils/logger";
import { createTool } from "../base";
import { createToolResult } from "../result";
import {
  DOC_TYPE_TO_FILENAME,
  ensureDirectoryExists,
  getTaskDocsPath,
  validateTaskListContent,
} from "./utils";

const buildUpdateTaskDocsContinuationSummary = (phase: string): string => {
  const fileName = DOC_TYPE_TO_FILENAME[phase] || phase;
  return `【已更新 ${fileName}】`;
};

const buildUpdateTaskDocsContinuationResult = (params: {
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

type UpdateTaskDocsOperation =
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

const parseLineNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    return Number.parseInt(value, 10);
  }
  return Number.NaN;
};

const splitLines = (content: string): string[] => (content.length === 0 ? [] : content.split("\n"));

const resolveUpdateTaskDocsOperation = (params: {
  content?: unknown;
  startLine?: unknown;
  endLine?: unknown;
  expectedOriginalContent?: unknown;
  oldString?: unknown;
  newString?: unknown;
}): { operation?: UpdateTaskDocsOperation; error?: string } => {
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
        error: "按行修改需要提供 expectedOriginalContent，用于校验当前文档片段仍与读取时一致",
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
        "整篇更新需要提供 content；如果只改局部，请提供 startLine、endLine、content 和 expectedOriginalContent，或使用 oldString/newString",
    };
  }

  return {
    operation: {
      kind: "write",
      content: params.content,
    },
  };
};

const applyLinePatch = (
  originalContent: string,
  operation: Extract<UpdateTaskDocsOperation, { kind: "linePatch" }>,
): { updatedContent?: string; error?: string } => {
  const lines = splitLines(originalContent);
  if (operation.startLine > lines.length + 1) {
    return {
      error: `startLine 超出范围，当前文档只有 ${lines.length} 行`,
    };
  }

  const currentSlice = lines
    .slice(operation.startLine - 1, Math.min(lines.length, operation.endLine))
    .join("\n");
  if (currentSlice !== operation.expectedOriginalContent) {
    return {
      error:
        "按行修改前校验失败：目标行内容已发生变化。请先重新 readTaskDocs，并基于最新内容传入 expectedOriginalContent 后再试。",
    };
  }

  const updatedContent = [
    ...lines.slice(0, operation.startLine - 1),
    ...operation.content.split("\n"),
    ...lines.slice(Math.min(lines.length, operation.endLine)),
  ].join("\n");

  return { updatedContent };
};

const applySearchReplace = (
  originalContent: string,
  operation: Extract<UpdateTaskDocsOperation, { kind: "searchReplace" }>,
): { updatedContent?: string; error?: string } => {
  const matchCount = originalContent.split(operation.oldString).length - 1;

  if (matchCount === 0) {
    return {
      error:
        "精确替换失败：oldString 未在文档中命中。请先 readTaskDocs，确保传入完整且精确的原文片段。",
    };
  }

  if (matchCount > 1) {
    return {
      error: `精确替换失败：oldString 在文档中命中 ${matchCount} 次，无法唯一定位。请提供更长的上下文使其唯一。`,
    };
  }

  return {
    updatedContent: originalContent.replace(operation.oldString, operation.newString),
  };
};

const countWrittenLines = (operation: UpdateTaskDocsOperation): number =>
  operation.kind === "searchReplace"
    ? operation.newString.split("\n").length
    : operation.content.split("\n").length;

export const UpdateTaskDocs = createTool({
  name: "updateTaskDocs",
  description:
    "对当前任务文档（requirements/design/taskList）做受保护的渐进式更新。Spec Mode 下，这些文档是通用 SOP 的显式落地：requirements=任务目标拆解，design=初步方案与权衡，taskList=执行分解。支持整篇重写、按唯一 oldString/newString 精确替换，或基于 startLine/endLine 的受保护局部替换。",
  whenToUse:
    "创建或更新任务文档时使用。文档不存在时会自动创建；通常先 readTaskDocs 获取带行号内容，再用本工具做最小修改。",
  params: [
    {
      name: "phase",
      optional: false,
      description: "文档类型：requirements（需求文档）、design（设计文档）、taskList（任务列表）",
    },
    {
      name: "content",
      optional: true,
      description:
        "整篇重写时必填；按行修改时需与 startLine、endLine、expectedOriginalContent 一起提供",
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
        "按行修改时必填：startLine-endLine 当前应匹配的原文片段。必须与最新 readTaskDocs 结果完全一致，不含行号。",
    },
    {
      name: "oldString",
      optional: true,
      description: "可选：精确替换模式下要匹配的唯一原文片段，必须与文档内容完全一致",
    },
    {
      name: "newString",
      optional: true,
      description: "可选：与 oldString 配对使用，表示替换后的新文本。",
    },
  ],

  async invoke({ params, context }) {
    const { phase } = params;
    const { taskId } = context;

    if (!taskId) {
      const errorMsg = "taskId 不能为空";
      return createToolResult(
        {
          success: false,
          filePath: "",
          message: errorMsg,
        },
        {
          transportMessage: errorMsg,
        },
      );
    }

    if (!["requirements", "design", "taskList"].includes(phase)) {
      const errorMsg = `无效的文档类型: ${phase}。支持的类型：requirements、design、taskList`;
      return createToolResult(
        {
          success: false,
          filePath: "",
          message: errorMsg,
        },
        {
          transportMessage: errorMsg,
        },
      );
    }

    const { operation, error } = resolveUpdateTaskDocsOperation(params);
    if (!operation) {
      return createToolResult(
        {
          success: false,
          filePath: "",
          message: error || "updateTaskDocs 参数无效",
        },
        {
          transportMessage: error || "updateTaskDocs 参数无效",
        },
      );
    }

    const fileName = DOC_TYPE_TO_FILENAME[phase] || "";
    if (!fileName) {
      const errorMsg = `无法获取文档文件名: ${phase}`;
      return createToolResult(
        {
          success: false,
          filePath: "",
          message: errorMsg,
        },
        {
          transportMessage: errorMsg,
        },
      );
    }

    const taskDocsPath = getTaskDocsPath(taskId as string);
    const filePath = path.join(taskDocsPath, fileName);

    try {
      ensureDirectoryExists(taskDocsPath);

      const originalContent = existsSync(filePath)
        ? readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n")
        : "";
      const updateResult =
        operation.kind === "write"
          ? { updatedContent: operation.content }
          : operation.kind === "searchReplace"
            ? applySearchReplace(originalContent, operation)
            : applyLinePatch(originalContent, operation);

      if (!updateResult.updatedContent) {
        const errorMsg = updateResult.error || "更新任务文档失败";
        return createToolResult(
          {
            success: false,
            filePath,
            message: errorMsg,
          },
          {
            transportMessage: errorMsg,
          },
        );
      }

      if (phase === "taskList") {
        const formatError = validateTaskListContent(updateResult.updatedContent);
        if (formatError) {
          return createToolResult(
            {
              success: false,
              filePath,
              message: formatError,
            },
            {
              transportMessage: formatError,
            },
          );
        }
      }

      writeFileSync(filePath, updateResult.updatedContent, "utf-8");

      const linesWritten = countWrittenLines(operation);
      const successMsg =
        operation.kind === "write"
          ? `成功重写文档: ${fileName}`
          : operation.kind === "searchReplace"
            ? `成功精确更新文档: ${fileName}`
            : `成功修改文档 ${fileName} 的第 ${operation.startLine}-${operation.endLine} 行`;
      logger.info(`[UpdateTaskDocs] ${successMsg}`);

      return createToolResult(
        {
          success: true,
          filePath,
          message: successMsg,
          updatedContent: updateResult.updatedContent,
          linesWritten,
        },
        {
          transportMessage: successMsg,
          continuationSummary: buildUpdateTaskDocsContinuationSummary(phase),
          continuationResult: buildUpdateTaskDocsContinuationResult({
            success: true,
            filePath,
            message: successMsg,
            linesWritten,
          }),
        },
      );
    } catch (invokeError) {
      const errorMsg = `更新文档失败: ${invokeError instanceof Error ? invokeError.message : String(invokeError)}`;
      logger.error(`[UpdateTaskDocs] ${errorMsg}`);

      return createToolResult(
        {
          success: false,
          filePath,
          message: errorMsg,
        },
        {
          transportMessage: errorMsg,
        },
      );
    }
  },
});

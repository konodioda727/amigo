import type { ReadFileResult } from "@amigo-llm/types";
import type { Sandbox } from "@/core/sandbox";
import { logger } from "@/utils/logger";
import { createTool } from "./base";

const normalizeReadFilePath = (filePath: string) => filePath.trim().replace(/^(\.\/)+/, "");

const escapeShellPath = (filePath: string) => filePath.replaceAll("'", "'\\''");

const addLineNumbers = (content: string, startLine: number) =>
  content
    .split("\n")
    .map((line, index) => `${String(startLine + index).padStart(4, " ")}| ${line}`)
    .join("\n");

const buildFailureResult = (
  filePath: string,
  message: string,
): ReadFileResult["files"][number] => ({
  success: false,
  content: "",
  filePath,
  message,
});

const readSingleFile = async (
  sandbox: Sandbox,
  filePath: string,
  startLine?: number,
  endLine?: number,
): Promise<ReadFileResult["files"][number]> => {
  const escapedPath = escapeShellPath(filePath);
  const existsResult = await sandbox.runCommand(
    `test -f '${escapedPath}' && echo "exists" || echo "not_found"`,
  );
  if (!existsResult?.includes("exists")) {
    return buildFailureResult(filePath, `文件不存在: ${filePath}`);
  }

  const lineCountResult = await sandbox.runCommand(`wc -l < '${escapedPath}'`);
  const totalLines = Number.parseInt(lineCountResult?.trim() || "0", 10);

  let content: string;
  let readInfo: string;
  let numberedStartLine = 1;

  if (startLine !== undefined && endLine !== undefined) {
    const start = Math.max(1, Number(startLine));
    const end = Math.min(totalLines, Number(endLine));
    content = (await sandbox.runCommand(`sed -n '${start},${end}p' '${escapedPath}'`)) || "";
    readInfo = `第 ${start}-${end} 行`;
    numberedStartLine = start;
  } else if (startLine !== undefined) {
    const start = Math.max(1, Number(startLine));
    content = (await sandbox.runCommand(`sed -n '${start},$p' '${escapedPath}'`)) || "";
    readInfo = `第 ${start} 行到末尾`;
    numberedStartLine = start;
  } else if (endLine !== undefined) {
    const end = Math.min(totalLines, Number(endLine));
    content = (await sandbox.runCommand(`sed -n '1,${end}p' '${escapedPath}'`)) || "";
    readInfo = `第 1-${end} 行`;
  } else {
    content = (await sandbox.runCommand(`cat '${escapedPath}'`)) || "";
    readInfo = "全部内容";
  }

  const trimmedContent = content.trim();
  return {
    success: true,
    content: trimmedContent ? addLineNumbers(trimmedContent, numberedStartLine) : "",
    filePath,
    message: `成功读取文件 ${filePath}（${readInfo}，共 ${totalLines} 行）`,
    totalLines,
  };
};

const createInvalidParamsResult = (message: string) => ({
  message,
  toolResult: {
    success: false,
    files: [],
    filePaths: [],
    message,
  } satisfies ReadFileResult,
});

/**
 * ReadFile 工具
 * 用于从沙箱中批量读取文件内容
 */
export const ReadFile = createTool({
  name: "readFile",
  description:
    "从沙箱中批量读取文件内容。支持一次读取多个文件，并可按行范围截取内容，返回内容自带真实行号。",
  whenToUse:
    "需要同时查看多个文件内容或定位指定行时使用。通常在 editFile 前先 readFile 以确认上下文；后续若要按行修改，直接使用返回内容中的行号。",

  params: [
    {
      name: "filePaths",
      optional: false,
      type: "array",
      description: "要读取的文件路径列表（支持相对于沙箱工作目录的路径或绝对路径）",
      params: [
        {
          name: "filePath",
          optional: false,
          description: "单个要读取的文件路径",
        },
      ],
    },
    {
      name: "startLine",
      optional: true,
      description: "可选：起始行号（从 1 开始）",
    },
    {
      name: "endLine",
      optional: true,
      description: "可选：结束行号（包含）",
    },
  ],

  async invoke({ params, context }) {
    const rawFilePaths = Array.isArray(params.filePaths) ? params.filePaths : [];
    const filePaths = rawFilePaths.map(normalizeReadFilePath).filter(Boolean);
    const { startLine, endLine } = params;

    if (filePaths.length === 0) {
      return createInvalidParamsResult("文件路径列表不能为空");
    }

    try {
      const sandbox = (await context.getSandbox()) as Sandbox;
      if (!sandbox || !sandbox.isRunning()) {
        return createInvalidParamsResult("沙箱未运行，无法读取文件");
      }

      const files: ReadFileResult["files"] = [];
      for (const filePath of filePaths) {
        files.push(await readSingleFile(sandbox, filePath, startLine, endLine));
      }
      const successCount = files.filter((file) => file.success).length;
      const failureCount = files.length - successCount;
      const allSucceeded = failureCount === 0;
      const summaryMessage = allSucceeded
        ? `成功读取 ${successCount} 个文件`
        : `读取完成：成功 ${successCount} 个，失败 ${failureCount} 个`;

      logger.info(`[ReadFile] ${summaryMessage}: ${filePaths.join(", ")}`);

      return {
        message: summaryMessage,
        toolResult: {
          success: allSucceeded,
          files,
          filePaths,
          message: summaryMessage,
        } satisfies ReadFileResult,
      };
    } catch (error) {
      const errorMsg = `读取文件失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`[ReadFile] ${errorMsg}`);
      return {
        message: errorMsg,
        toolResult: {
          success: false,
          files: filePaths.map((filePath) => buildFailureResult(filePath, errorMsg)),
          filePaths,
          message: errorMsg,
        } satisfies ReadFileResult,
      };
    }
  },
});

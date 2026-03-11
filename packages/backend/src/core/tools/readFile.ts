import type { Sandbox } from "@/core/sandbox";
import { logger } from "@/utils/logger";
import { createTool } from "./base";

const normalizeReadFilePath = (filePath: string) => filePath.trim().replace(/^(\.\/)+/, "");

const addLineNumbers = (content: string, startLine: number) =>
  content
    .split("\n")
    .map((line, index) => `${String(startLine + index).padStart(4, " ")}| ${line}`)
    .join("\n");

/**
 * ReadFile 工具
 * 用于从沙箱中读取文件内容
 */
export const ReadFile = createTool({
  name: "readFile",
  description: "从沙箱中读取文件内容。支持读取整个文件或指定行范围。返回内容自带真实行号。",
  whenToUse:
    "需要查看文件内容或定位指定行时使用。通常在 editFile 前先 readFile 以确认上下文；后续若要按行修改，直接使用返回内容中的行号。",

  params: [
    {
      name: "filePath",
      optional: false,
      description: "文件路径（支持相对于沙箱工作目录的路径或绝对路径）",
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
    const { filePath, startLine, endLine } = params;

    if (!filePath || filePath.trim() === "") {
      const errorMsg = "文件路径不能为空";
      return {
        message: errorMsg,
        toolResult: { success: false, content: "", filePath: "", message: errorMsg },
      };
    }

    const cleanPath = normalizeReadFilePath(filePath);

    try {
      const sandbox = (await context.getSandbox()) as Sandbox;
      if (!sandbox || !sandbox.isRunning()) {
        const errorMsg = "沙箱未运行，无法读取文件";
        return {
          message: errorMsg,
          toolResult: { success: false, content: "", filePath: cleanPath, message: errorMsg },
        };
      }

      const existsResult = await sandbox.runCommand(
        `test -f '${cleanPath}' && echo "exists" || echo "not_found"`,
      );
      if (!existsResult?.includes("exists")) {
        const errorMsg = `文件不存在: ${cleanPath}`;
        return {
          message: errorMsg,
          toolResult: { success: false, content: "", filePath: cleanPath, message: errorMsg },
        };
      }

      const lineCountResult = await sandbox.runCommand(`wc -l < '${cleanPath}'`);
      const totalLines = Number.parseInt(lineCountResult?.trim() || "0", 10);

      let content: string;
      let readInfo: string;
      let numberedStartLine = 1;

      if (startLine !== undefined && endLine !== undefined) {
        const start = Math.max(1, Number(startLine));
        const end = Math.min(totalLines, Number(endLine));
        content = (await sandbox.runCommand(`sed -n '${start},${end}p' '${cleanPath}'`)) || "";
        readInfo = `第 ${start}-${end} 行`;
        numberedStartLine = start;
      } else if (startLine !== undefined) {
        const start = Math.max(1, Number(startLine));
        content = (await sandbox.runCommand(`sed -n '${start},$p' '${cleanPath}'`)) || "";
        readInfo = `第 ${start} 行到末尾`;
        numberedStartLine = start;
      } else if (endLine !== undefined) {
        const end = Math.min(totalLines, Number(endLine));
        content = (await sandbox.runCommand(`sed -n '1,${end}p' '${cleanPath}'`)) || "";
        readInfo = `第 1-${end} 行`;
      } else {
        content = (await sandbox.runCommand(`cat '${cleanPath}'`)) || "";
        readInfo = "全部内容";
      }

      const trimmedContent = content.trim();
      const numberedContent = trimmedContent
        ? addLineNumbers(trimmedContent, numberedStartLine)
        : "";

      const successMsg = `成功读取文件 ${cleanPath}（${readInfo}，共 ${totalLines} 行）`;
      logger.info(`[ReadFile] ${successMsg}`);

      return {
        message: successMsg,
        toolResult: {
          success: true,
          content: numberedContent,
          filePath: cleanPath,
          message: successMsg,
          totalLines,
        },
      };
    } catch (error) {
      const errorMsg = `读取文件失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`[ReadFile] ${errorMsg}`);
      return {
        message: errorMsg,
        toolResult: { success: false, content: "", filePath: cleanPath, message: errorMsg },
      };
    }
  },
});

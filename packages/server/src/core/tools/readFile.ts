import type { Sandbox } from "@/core/sandbox";
import { logger } from "@/utils/logger";
import { createTool } from "./base";

/**
 * ReadFile 工具
 * 用于从沙箱中读取文件内容
 */
export const ReadFile = createTool({
  name: "readFile",
  description: "从沙箱中读取文件内容。支持读取整个文件或指定行范围。",
  whenToUse:
    "**工具性质：**\n" +
    "这是一个文件读取工具，用于获取沙箱中文件的内容。\n\n" +
    "**适用场景：**\n" +
    "1. **查看文件内容：** 读取配置文件、代码文件等\n" +
    "2. **检查执行结果：** 读取程序输出文件\n" +
    "3. **部分读取：** 只读取文件的特定行范围\n\n" +
    "**读取选项：**\n" +
    "- 不指定行号：读取整个文件\n" +
    "- 指定 startLine 和 endLine：读取指定行范围\n\n" +
    "**注意事项：**\n" +
    "- 文件路径相对于沙箱工作目录 /sandbox\n" +
    "- 行号从 1 开始\n" +
    "- 如果文件不存在会返回错误",

  useExamples: [
    `<readFile>
  <filePath>src/main.py</filePath>
</readFile>`,
    `<readFile>
  <filePath>config.json</filePath>
  <startLine>1</startLine>
  <endLine>10</endLine>
</readFile>`,
    `<readFile>
  <filePath>logs/output.txt</filePath>
  <startLine>100</startLine>
  <endLine>150</endLine>
</readFile>`,
  ],

  params: [
    {
      name: "filePath",
      optional: false,
      description: "文件路径（相对于沙箱工作目录）",
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

    const cleanPath = filePath.replace(/^(\.\/|\/)+/, "");

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

      if (startLine !== undefined && endLine !== undefined) {
        const start = Math.max(1, Number(startLine));
        const end = Math.min(totalLines, Number(endLine));
        content = (await sandbox.runCommand(`sed -n '${start},${end}p' '${cleanPath}'`)) || "";
        readInfo = `第 ${start}-${end} 行`;
      } else if (startLine !== undefined) {
        const start = Math.max(1, Number(startLine));
        content = (await sandbox.runCommand(`sed -n '${start},$p' '${cleanPath}'`)) || "";
        readInfo = `第 ${start} 行到末尾`;
      } else if (endLine !== undefined) {
        const end = Math.min(totalLines, Number(endLine));
        content = (await sandbox.runCommand(`sed -n '1,${end}p' '${cleanPath}'`)) || "";
        readInfo = `第 1-${end} 行`;
      } else {
        content = (await sandbox.runCommand(`cat '${cleanPath}'`)) || "";
        readInfo = "全部内容";
      }

      const successMsg = `成功读取文件 ${cleanPath}（${readInfo}，共 ${totalLines} 行）`;
      logger.info(`[ReadFile] ${successMsg}`);

      return {
        message: successMsg,
        toolResult: {
          success: true,
          content: content.trim(),
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

import type { Sandbox } from "@/core/sandbox";
import { logger } from "@/utils/logger";
import { createTool } from "./base";

/**
 * 转义 shell 特殊字符，使用 base64 编码来安全传输内容
 */
function escapeShellContent(content: string): string {
  return Buffer.from(content, "utf-8").toString("base64");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function toBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return defaultValue;
}

/**
 * EditFile 工具
 * 用于在沙箱中创建或修改文件
 */
export const EditFile = createTool({
  name: "editFile",
  description:
    "在沙箱中创建或修改文件。支持创建/覆盖写入，以及 patch 模式（按行替换或字符串查找替换）。",
  whenToUse:
    "**工具性质：**\n" +
    "这是一个文件编辑工具，用于在沙箱环境中创建和修改文件。\n\n" +
    "**适用场景：**\n" +
    "1. **创建新文件：** 使用 mode='create' 创建新文件（如果文件已存在则失败）\n" +
    "2. **覆盖文件：** 使用 mode='overwrite' 完全覆盖文件内容\n" +
    "3. **修改部分内容：** 使用 mode='patch' 修改文件的指定行范围，或按字符串查找替换\n\n" +
    "**操作模式说明：**\n" +
    "- `create`: 仅创建新文件，如果文件已存在则返回错误\n" +
    "- `overwrite`: 覆盖写入，文件不存在则创建\n" +
    "- `patch`: 支持两种方式：\n" +
    "  - 行号 patch：提供 startLine、endLine、content\n" +
    "  - 字符串 patch：提供 search、replace（可选 replaceAll）\n\n" +
    "**注意事项：**\n" +
    "- 文件路径相对于沙箱工作目录 /sandbox\n" +
    "- 会自动创建不存在的父目录\n" +
    "- 文件使用 UTF-8 编码",

  useExamples: [
    `<editFile>
  <filePath>src/main.py</filePath>
  <content>print("Hello, World!")</content>
  <mode>create</mode>
</editFile>`,
    `<editFile>
  <filePath>config.json</filePath>
  <content>{"name": "test", "version": "1.0.0"}</content>
  <mode>overwrite</mode>
</editFile>`,
    `<editFile>
  <filePath>src/utils.py</filePath>
  <content>def new_function():
    return "patched"</content>
  <mode>patch</mode>
  <startLine>10</startLine>
  <endLine>15</endLine>
</editFile>`,
    `<editFile>
  <filePath>packages/server/src/core/model/index.ts</filePath>
  <mode>patch</mode>
  <search>API_KEY environment variable is required</search>
  <replace>MODEL_API_KEY environment variable is required</replace>
</editFile>`,
  ],

  params: [
    {
      name: "filePath",
      optional: false,
      description: "文件路径（相对于沙箱工作目录）",
    },
    {
      name: "content",
      optional: true,
      description: "文件内容（create/overwrite 或行号 patch 模式必填）",
    },
    {
      name: "mode",
      optional: true,
      description: "操作模式：create=仅创建新文件，overwrite=覆盖写入（默认），patch=修改指定行",
    },
    {
      name: "startLine",
      optional: true,
      description: "patch 模式下的起始行号（从 1 开始）",
    },
    {
      name: "endLine",
      optional: true,
      description: "patch 模式下的结束行号（包含）",
    },
    {
      name: "search",
      optional: true,
      description: "patch 模式可选：按字符串查找替换时的 search 文本",
    },
    {
      name: "replace",
      optional: true,
      description: "patch 模式可选：按字符串查找替换时的 replace 文本",
    },
    {
      name: "replaceAll",
      optional: true,
      description: "patch 模式可选：是否替换所有匹配（默认 false）",
    },
    {
      name: "failIfNoMatch",
      optional: true,
      description: "patch 模式可选：无匹配时是否报错（默认 true）",
    },
  ],

  async invoke({ params, context }) {
    const {
      filePath,
      content,
      mode = "overwrite",
      startLine,
      endLine,
      search,
      replace,
      replaceAll,
      failIfNoMatch,
    } = params;

    logger.info(`[EditFile] invoke called with filePath: ${filePath}, mode: ${mode}`);
    logger.info(
      `[EditFile] context.taskId: ${context.taskId}, context.parentId: ${context.parentId}`,
    );

    if (!filePath || filePath.trim() === "") {
      const errorMsg = "文件路径不能为空";
      return {
        message: errorMsg,
        toolResult: { success: false, filePath: "", message: errorMsg },
      };
    }

    const cleanPath = filePath.replace(/^(\.\/|\/)+/, "");

    try {
      logger.info(`[EditFile] Calling context.getSandbox()...`);
      const sandbox = (await context.getSandbox()) as Sandbox;
      logger.info(
        `[EditFile] getSandbox returned, sandbox: ${!!sandbox}, isRunning: ${sandbox?.isRunning()}`,
      );

      if (!sandbox || !sandbox.isRunning()) {
        const errorMsg = "沙箱未运行，无法编辑文件";
        return {
          message: errorMsg,
          toolResult: { success: false, filePath: cleanPath, message: errorMsg },
        };
      }

      const dirPath = cleanPath.includes("/")
        ? cleanPath.substring(0, cleanPath.lastIndexOf("/"))
        : "";

      if (dirPath) {
        await sandbox.runCommand(`mkdir -p ${shellQuote(dirPath)}`);
      }

      if (mode === "create") {
        const existsResult = await sandbox.runCommand(
          `test -f ${shellQuote(cleanPath)} && echo "exists" || echo "not_found"`,
        );
        if (existsResult?.includes("exists")) {
          const errorMsg = `文件已存在: ${cleanPath}。使用 mode='overwrite' 来覆盖`;
          return {
            message: errorMsg,
            toolResult: { success: false, filePath: cleanPath, message: errorMsg },
          };
        }
      }

      if (mode === "patch") {
        const existsResult = await sandbox.runCommand(
          `test -f ${shellQuote(cleanPath)} && echo "exists" || echo "not_found"`,
        );
        if (!existsResult?.includes("exists")) {
          const errorMsg = `文件不存在: ${cleanPath}。patch 模式只能修改已有文件；请先用 mode='create' 或 mode='overwrite' 创建文件`;
          return {
            message: errorMsg,
            toolResult: { success: false, filePath: cleanPath, message: errorMsg },
          };
        }

        const originalContent = await sandbox.runCommand(`cat ${shellQuote(cleanPath)}`);
        if (originalContent === undefined) {
          const errorMsg = "无法读取原文件内容";
          return {
            message: errorMsg,
            toolResult: { success: false, filePath: cleanPath, message: errorMsg },
          };
        }

        const hasLinePatch = startLine !== undefined || endLine !== undefined;
        const hasSearchReplace = search !== undefined || replace !== undefined;

        if (hasLinePatch) {
          if (startLine === undefined || endLine === undefined) {
            const errorMsg = "行号 patch 模式需要同时提供 startLine 和 endLine";
            return {
              message: errorMsg,
              toolResult: { success: false, filePath: cleanPath, message: errorMsg },
            };
          }
          if (typeof content !== "string") {
            const errorMsg = "行号 patch 模式需要提供 content";
            return {
              message: errorMsg,
              toolResult: { success: false, filePath: cleanPath, message: errorMsg },
            };
          }

          const lines = originalContent.split("\n");
          const start = Math.max(1, Number(startLine)) - 1;
          const end = Math.min(lines.length, Number(endLine));
          const newLines = content.split("\n");
          const resultLines = [...lines.slice(0, start), ...newLines, ...lines.slice(end)];

          const base64Content = escapeShellContent(resultLines.join("\n"));
          await sandbox.runCommand(
            `printf '%s' ${shellQuote(base64Content)} | base64 -d > ${shellQuote(cleanPath)}`,
          );

          const linesWritten = newLines.length;
          const successMsg = `成功修改文件 ${cleanPath} 的第 ${startLine}-${endLine} 行（共 ${linesWritten} 行）`;
          logger.info(`[EditFile] ${successMsg}`);

          return {
            message: successMsg,
            toolResult: { success: true, filePath: cleanPath, message: successMsg, linesWritten },
          };
        }

        if (hasSearchReplace) {
          if (typeof search !== "string" || replace === undefined) {
            const errorMsg = "字符串 patch 模式需要同时提供 search 和 replace";
            return {
              message: errorMsg,
              toolResult: { success: false, filePath: cleanPath, message: errorMsg },
            };
          }
          if (search.length === 0) {
            const errorMsg = "search 不能为空字符串";
            return {
              message: errorMsg,
              toolResult: { success: false, filePath: cleanPath, message: errorMsg },
            };
          }

          const replaceText = String(replace);
          const replaceAllFlag = toBoolean(replaceAll, false);
          const failIfNoMatchFlag = toBoolean(failIfNoMatch, true);

          let replacements = 0;
          let updatedContent = originalContent;

          if (replaceAllFlag) {
            const parts = originalContent.split(search);
            replacements = Math.max(0, parts.length - 1);
            updatedContent = parts.join(replaceText);
          } else {
            const index = originalContent.indexOf(search);
            if (index >= 0) {
              replacements = 1;
              updatedContent =
                originalContent.slice(0, index) +
                replaceText +
                originalContent.slice(index + search.length);
            }
          }

          if (replacements === 0 && failIfNoMatchFlag) {
            const errorMsg = `未找到可替换内容（search="${search}"）`;
            return {
              message: errorMsg,
              toolResult: {
                success: false,
                filePath: cleanPath,
                message: errorMsg,
                replacements: 0,
              },
            };
          }

          const base64Content = escapeShellContent(updatedContent);
          await sandbox.runCommand(
            `printf '%s' ${shellQuote(base64Content)} | base64 -d > ${shellQuote(cleanPath)}`,
          );

          const successMsg =
            replacements === 0
              ? `未找到匹配，文件保持不变: ${cleanPath}`
              : `成功在文件 ${cleanPath} 中执行字符串替换（替换 ${replacements} 处）`;
          logger.info(`[EditFile] ${successMsg}`);

          return {
            message: successMsg,
            toolResult: {
              success: true,
              filePath: cleanPath,
              message: successMsg,
              replacements,
              linesWritten: updatedContent.split("\n").length,
            },
          };
        }

        const errorMsg =
          "patch 模式需要提供行号参数（startLine/endLine + content）或字符串参数（search + replace）";
        return {
          message: errorMsg,
          toolResult: { success: false, filePath: cleanPath, message: errorMsg },
        };
      }

      if (typeof content !== "string") {
        const errorMsg = `${mode} 模式需要提供 content`;
        return {
          message: errorMsg,
          toolResult: { success: false, filePath: cleanPath, message: errorMsg },
        };
      }

      const base64Content = escapeShellContent(content);
      // 使用更兼容的方式写入文件
      const writeCommand = `printf '%s' ${shellQuote(base64Content)} | base64 -d > ${shellQuote(cleanPath)}`;
      await sandbox.runCommand(writeCommand);

      // 检查写入是否成功
      const checkResult = await sandbox.runCommand(
        `test -f ${shellQuote(cleanPath)} && echo "exists" || echo "not_found"`,
      );
      if (!checkResult?.includes("exists")) {
        throw new Error(`文件创建失败，检查结果: ${checkResult}`);
      }

      const linesWritten = content.split("\n").length;
      const modeText = mode === "create" ? "创建" : "写入";
      const successMsg = `成功${modeText}文件: ${cleanPath}（共 ${linesWritten} 行）`;
      logger.info(`[EditFile] ${successMsg}`);

      return {
        message: successMsg,
        toolResult: { success: true, filePath: cleanPath, message: successMsg, linesWritten },
      };
    } catch (error) {
      const errorMsg = `编辑文件失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`[EditFile] ${errorMsg}`);
      return {
        message: errorMsg,
        toolResult: { success: false, filePath: cleanPath, message: errorMsg },
      };
    }
  },
});

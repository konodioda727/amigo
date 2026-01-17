import type { Sandbox } from "@/core/sandbox";
import { logger } from "@/utils/logger";
import { createTool } from "./base";

/**
 * Bash 工具
 * 用于在沙箱中执行 bash 命令
 */
export const Bash = createTool({
  name: "bash",
  description: "在沙箱中执行 bash 命令。用于运行脚本、查看目录结构、执行程序等。",
  whenToUse:
    "**工具性质：**\n" +
    "这是一个命令执行工具，用于在沙箱环境中运行 bash 命令。\n\n" +
    "**适用场景：**\n" +
    "1. **查看目录结构：** 使用 ls、tree 等命令\n" +
    "2. **运行程序：** 执行 Python、Node.js 等脚本\n" +
    "3. **文件操作：** 复制、移动、删除文件\n" +
    "4. **环境检查：** 查看环境变量、安装的软件等\n\n" +
    "**安全限制：**\n" +
    "- 命令在隔离的沙箱容器中执行\n" +
    "- 工作目录默认为 /sandbox\n" +
    "- 可以指定子目录作为工作目录\n\n" +
    "**注意事项：**\n" +
    "- 避免执行长时间运行的命令\n" +
    "- 命令输出会被捕获并返回\n" +
    "- 某些危险命令可能被限制",

  useExamples: [
    `<bash>
  <command>ls -la</command>
</bash>`,
    `<bash>
  <command>python main.py</command>
  <workingDir>src</workingDir>
</bash>`,
    `<bash>
  <command>tree -L 2</command>
</bash>`,
    `<bash>
  <command>cat package.json | head -20</command>
</bash>`,
  ],

  params: [
    {
      name: "command",
      optional: false,
      description: "要执行的 bash 命令",
    },
    {
      name: "workingDir",
      optional: true,
      description: "可选：工作目录（相对于沙箱根目录 /sandbox）",
    },
  ],

  async invoke({ params, context }) {
    const { command, workingDir } = params;

    logger.info(`[Bash] invoke called with command: ${command}, workingDir: ${workingDir}`);
    logger.info(`[Bash] context.taskId: ${context.taskId}, context.parentId: ${context.parentId}`);

    if (!command || command.trim() === "") {
      const errorMsg = "命令不能为空";
      return {
        message: errorMsg,
        toolResult: { success: false, output: "", message: errorMsg },
      };
    }

    try {
      logger.info(`[Bash] Calling context.getSandbox()...`);
      const sandbox = (await context.getSandbox()) as Sandbox;
      logger.info(
        `[Bash] getSandbox returned, sandbox: ${!!sandbox}, isRunning: ${sandbox?.isRunning()}`,
      );

      if (!sandbox || !sandbox.isRunning()) {
        const errorMsg = "沙箱未运行，无法执行命令";
        return {
          message: errorMsg,
          toolResult: { success: false, output: "", message: errorMsg },
        };
      }

      let fullCommand = command;
      if (workingDir) {
        const cleanWorkingDir = workingDir.replace(/^(\.\/|\/)+/, "");
        fullCommand = `cd '${cleanWorkingDir}' && ${command}`;
      }

      logger.info(`[Bash] Running command: ${fullCommand}`);
      const output = await sandbox.runCommand(fullCommand);
      logger.info(`[Bash] Command output: ${output?.substring(0, 200)}...`);

      const exitCodeResult = await sandbox.runCommand("echo $?");
      const exitCode = Number.parseInt(exitCodeResult?.trim() || "0", 10);

      const success = exitCode === 0;
      const statusText = success ? "成功" : "失败";
      const resultMsg = `命令执行${statusText}${workingDir ? `（工作目录: ${workingDir}）` : ""}`;

      logger.info(`[Bash] ${resultMsg}: ${command}`);

      return {
        message: resultMsg,
        toolResult: {
          success,
          output: output?.trim() || "",
          exitCode,
          message: resultMsg,
        },
      };
    } catch (error) {
      const errorMsg = `执行命令失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(`[Bash] ${errorMsg}`);
      logger.error(`[Bash] Full error:`, error);
      return {
        message: errorMsg,
        toolResult: { success: false, output: "", message: errorMsg },
      };
    }
  },
});

import type { Sandbox } from "@/core/sandbox";
import { logger } from "@/utils/logger";
import { createTool } from "./base";

function normalizeWorkingDir(input: string | undefined): string {
  const trimmed = input?.trim() || "";
  if (!trimmed || trimmed === "." || trimmed === "/sandbox" || trimmed === "sandbox") {
    return "";
  }

  const normalized = trimmed.replace(/^\/sandbox\/?/, "").replace(/^(\.\/|\/)+/, "");
  return normalized === "sandbox" ? "" : normalized;
}

/**
 * Bash 工具
 * 用于在沙箱中执行 bash 命令
 */
export const Bash = createTool({
  name: "bash",
  description: "在沙箱中执行 bash 命令。用于运行脚本、查看目录结构、执行程序等。",
  whenToUse:
    "需要在沙箱里执行命令（运行脚本、查看目录/环境、快速诊断）时使用。优先短命令并明确 workingDir。",

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
      const cleanWorkingDir = normalizeWorkingDir(workingDir);
      if (cleanWorkingDir) {
        fullCommand = `cd '${cleanWorkingDir}' && ${command}`;
      }

      logger.info(`[Bash] Running command: ${fullCommand}`);

      // Capture both output and exit code in a single command execution.
      // Use a newline instead of ";" so commands ending with "&" don't become invalid "&;".
      const commandWithExitCode = `${fullCommand}
echo EXIT_CODE:$?`;
      const rawOutput = await sandbox.runCommand(commandWithExitCode, context.signal);

      logger.info(`[Bash] Command raw output length: ${rawOutput?.length}`);
      logger.info(`[Bash] Command raw output (full): ${JSON.stringify(rawOutput)}`);

      // Parse output and exit code
      let output = rawOutput || "";
      let exitCode = 0;

      // Extract exit code - look for EXIT_CODE:number pattern anywhere in the output
      // Use a more flexible approach: find the last occurrence
      const lines = output.split(/\r?\n/);
      logger.info(
        `[Bash] Output lines: ${lines.length}, last line: ${JSON.stringify(lines[lines.length - 1])}`,
      );

      // Find the EXIT_CODE line (should be the last non-empty line)
      let exitCodeLineIndex = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line?.trim().startsWith("EXIT_CODE:")) {
          exitCodeLineIndex = i;
          break;
        }
      }

      if (exitCodeLineIndex >= 0) {
        const exitCodeLine = lines[exitCodeLineIndex];
        if (exitCodeLine) {
          const match = exitCodeLine.match(/EXIT_CODE:(\d+)/);
          if (match?.[1]) {
            exitCode = Number.parseInt(match[1], 10);
            // Remove the exit code line from output
            lines.splice(exitCodeLineIndex, 1);
            output = lines.join("\n").trim();
            logger.info(
              `[Bash] Found EXIT_CODE line at index ${exitCodeLineIndex}: ${exitCodeLine}, parsed exitCode: ${exitCode}`,
            );
          }
        }
      } else {
        logger.warn(`[Bash] Could not find EXIT_CODE line in output`);
      }

      const success = exitCode === 0;
      const statusText = success ? "成功" : "失败";

      // Include output in the message for the AI
      const outputPreview =
        output.length > 500 ? `${output.substring(0, 500)}...(truncated)` : output;
      const resultMsg = `命令执行${statusText}${workingDir ? `（工作目录: ${workingDir}）` : ""}\n退出码: ${exitCode}${output ? `\n输出:\n${outputPreview}` : ""}`;

      logger.info(`[Bash] ${statusText}: ${command}, exitCode: ${exitCode}`);

      return {
        message: resultMsg,
        toolResult: {
          success,
          output,
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

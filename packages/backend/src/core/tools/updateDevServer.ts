import type { Sandbox } from "@/core/sandbox";
import { logger } from "@/utils/logger";
import { createTool } from "./base";
import { queueToolRetryAfterDependencies } from "./dependencyWorkflow";
import { createToolResult } from "./result";
import {
  getDependencyStatusForToolResult,
  normalizeSandboxToolWorkingDir,
} from "./sandboxDependency";

export const UpdateDevServer = createTool({
  name: "updateDevServer",
  description: "同步启动或重启沙箱中的开发预览服务，并返回可直接打开的预览地址。",
  whenToUse:
    "当仓库已经可运行，需要同步等待 dev server 可用后再继续时使用。调用前必须先读取目标工作目录的 package.json 与相关 README/文档，确认真实脚本、包管理器和 host/port 参数；非必要不要使用 npm，优先沿用项目已有的 bun/pnpm/yarn 方案。若依赖尚未安装，不要让后端猜安装命令，应先调用 installDependencies 并传入你基于仓库事实决定的 installCommand。",
  params: [
    {
      name: "startCommand",
      optional: false,
      description:
        "启动 dev server 的真实命令，必须基于仓库文档和脚本信息填写，例如 `bun run dev -- --host 0.0.0.0 --port 3000`、`pnpm dev --host 0.0.0.0 --port 3000` 或项目实际要求的等价命令。",
    },
    {
      name: "workingDir",
      optional: true,
      description: "命令执行目录，相对 /sandbox，默认仓库根目录。",
    },
  ],
  async invoke({ params, context }) {
    const startCommand = typeof params.startCommand === "string" ? params.startCommand.trim() : "";
    const workingDir = normalizeSandboxToolWorkingDir(
      typeof params.workingDir === "string" ? params.workingDir : undefined,
    );

    if (!startCommand) {
      throw new Error("startCommand 不能为空");
    }

    const sandbox = (await context.getSandbox()) as Sandbox;
    if (!sandbox || !sandbox.isRunning()) {
      throw new Error("sandbox 未运行，无法启动 dev server");
    }

    const sandboxTaskId = context.parentId || context.taskId;
    logger.info(
      `[updateDevServer] 同步执行 sandbox=${sandboxTaskId} workingDir=${workingDir} command=${startCommand}`,
    );

    const installStatus = await sandbox.resolveDependencyInstallStatus({
      workingDir,
    });
    if (installStatus.status === "running") {
      const waitingJob = queueToolRetryAfterDependencies({
        context,
        sandbox,
        sandboxTaskId,
        toolName: "updateDevServer",
        workingDir,
        toolParams: {
          startCommand,
          workingDir,
        },
        successPrompt: `依赖安装已完成。请立即继续之前等待的 updateDevServer 调用，参数如下：\n${JSON.stringify(
          {
            startCommand,
            workingDir,
          },
        )}\n不要再次请求用户确认，也不要重复安装依赖；先直接执行 updateDevServer，不要先单独向用户汇报“依赖已安装完成”。`,
        failurePrompt: (errorMessage) =>
          `之前等待的 updateDevServer 未执行，因为依赖安装失败。\n错误信息：${errorMessage}\n请先处理依赖安装问题，再决定下一步。`,
      });
      const dependencyStatus = getDependencyStatusForToolResult(installStatus.status);
      const status = waitingJob.started
        ? "waiting_for_dependencies"
        : "already_waiting_for_dependencies";
      const message =
        status === "waiting_for_dependencies"
          ? "依赖正在后台安装，开发预览会在安装完成后自动启动。"
          : "开发预览已在等待依赖安装完成，安装结束后会自动启动。";
      logger.info(
        `[updateDevServer] 等待依赖 task=${sandboxTaskId} status=${status} waitingJob=${waitingJob.job.id}`,
      );

      return createToolResult(
        {
          status,
          port: null,
          workingDir,
          startCommand,
          logPath: sandbox.getPreviewLogPath(),
          dependencyStatus,
          jobId: waitingJob.job.id,
        },
        {
          transportMessage: message,
        },
      );
    }

    if (installStatus.status === "idle") {
      throw new Error(
        "依赖尚未安装。请先读取目标目录的 package.json/README/锁文件，确认真实安装方式后调用 installDependencies，并传入明确的 installCommand。",
      );
    }

    if (installStatus.status === "failed") {
      throw new Error(
        `依赖安装失败，请先修复后再启动 dev server。日志: ${installStatus.logPath}${installStatus.error ? `\n\n最近错误:\n${installStatus.error}` : ""}`,
      );
    }

    await sandbox.startOrUpdateDevServer({
      startCommand,
      workingDir,
    });

    const previewHostPort = sandbox.getPreviewHostPort();
    const logPath = sandbox.getPreviewLogPath();
    const dependencyStatus = getDependencyStatusForToolResult(installStatus.status);

    return createToolResult(
      {
        status: "completed",
        port: previewHostPort,
        workingDir,
        startCommand,
        logPath,
        dependencyStatus,
      },
      {
        transportMessage: `开发预览已启动，可通过 Preview 打开（端口 ${previewHostPort || 0}）。`,
      },
    );
  },
});

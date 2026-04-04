import type { Sandbox } from "@/core/sandbox";
import { logger } from "@/utils/logger";
import { createTool } from "./base";
import {
  queueDependencyCompletionNotification,
  startDependencyInstallJob,
} from "./dependencyWorkflow";
import { createToolResult } from "./result";
import {
  getDependencyStatusForToolResult,
  normalizeSandboxToolWorkingDir,
} from "./sandboxDependency";

export const InstallDependencies = createTool({
  name: "installDependencies",
  description:
    "在沙箱中按 AI 提供的明确安装命令异步安装项目依赖，并复用 dev server/runChecks 共用的依赖状态。",
  whenToUse:
    "当用户明确要求安装依赖，或在启动 dev server、构建、测试前需要先确保依赖就绪时使用。调用前必须先读取目标工作目录的 package.json、README、锁文件和相关脚本，确认真实安装方式；installCommand 必须由 AI 基于仓库事实自行生成，不要依赖后端自动猜测包管理器。",
  params: [
    {
      name: "installCommand",
      optional: false,
      description:
        "依赖安装命令，必须由 AI 先读取 package.json、README、锁文件和项目脚本后自行决定，例如 `bun install`、`pnpm install --prefer-offline` 或仓库要求的自定义安装脚本。",
    },
    {
      name: "workingDir",
      optional: true,
      description: "依赖安装目录，相对 /sandbox，默认仓库根目录。",
    },
  ],
  async invoke({ params, context }) {
    const installCommand =
      typeof params.installCommand === "string" ? params.installCommand.trim() : "";
    const workingDir = normalizeSandboxToolWorkingDir(
      typeof params.workingDir === "string" ? params.workingDir : undefined,
    );
    if (!installCommand) {
      throw new Error("installCommand 不能为空");
    }

    const sandbox = (await context.getSandbox()) as Sandbox;
    if (!sandbox || !sandbox.isRunning()) {
      throw new Error("sandbox 未运行，无法安装依赖");
    }

    const sandboxTaskId = context.parentId || context.taskId;
    logger.info(
      `[installDependencies] 同步执行 sandbox=${sandboxTaskId} workingDir=${workingDir} command=${installCommand}`,
    );

    const currentStatus = await sandbox.resolveDependencyInstallStatus({
      workingDir,
      expectedInstallCommand: installCommand,
    });
    if (currentStatus.status === "success" || currentStatus.status === "not_required") {
      const dependencyStatus = getDependencyStatusForToolResult(currentStatus.status);
      const message =
        dependencyStatus === "not_required"
          ? "当前目录未检测到需要安装的 Node 依赖。"
          : "项目依赖已就绪。";

      return {
        transport: {
          message,
          result: {
            status: "completed",
            workingDir,
            packageManager: currentStatus.packageManager,
            installCommand: currentStatus.installCommand || "",
            logPath: currentStatus.logPath,
            dependencyStatus,
            async: false,
          },
        },
        continuation: {
          result: {
            status: "completed",
            workingDir,
            packageManager: currentStatus.packageManager,
            installCommand: currentStatus.installCommand || "",
            logPath: currentStatus.logPath,
            dependencyStatus,
            async: false,
          },
        },
      };
    }

    const { installStatus, job, started } = startDependencyInstallJob({
      sandbox,
      sandboxTaskId,
      workingDir,
      installCommand,
    });
    const notificationJob = queueDependencyCompletionNotification({
      context,
      sandbox,
      sandboxTaskId,
      workingDir,
      installCommand,
    });
    logger.info(
      `[installDependencies] 后台执行 sandbox=${sandboxTaskId} workingDir=${workingDir} status=${installStatus.status} packageManager=${installStatus.packageManager} started=${started} job=${job?.id || "none"} notifyJob=${notificationJob.job.id}`,
    );

    const dependencyStatus =
      installStatus.status === "idle"
        ? "running"
        : getDependencyStatusForToolResult(installStatus.status);
    const message = started
      ? "已开始后台安装依赖，可先继续修改代码。"
      : "依赖已在后台安装中，可先继续修改代码。";

    return createToolResult(
      {
        status: started ? "started" : "already_running",
        workingDir,
        packageManager: installStatus.packageManager || "custom",
        installCommand: installStatus.installCommand || installCommand,
        logPath: installStatus.logPath || currentStatus.logPath,
        dependencyStatus,
        jobId: job?.id || "",
        startedAt: job?.startedAt || "",
        async: true,
      },
      {
        transportMessage: message,
      },
    );
  },
});

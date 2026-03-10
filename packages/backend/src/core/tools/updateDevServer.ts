import type { Sandbox } from "@/core/sandbox";
import { logger } from "@/utils/logger";
import { createTool } from "./base";

const DEFAULT_WORKING_DIR = ".";

function normalizeWorkingDir(input: string | undefined): string {
  const trimmed = (input || DEFAULT_WORKING_DIR).trim();
  if (!trimmed || trimmed === "/sandbox") {
    return DEFAULT_WORKING_DIR;
  }

  return trimmed.replace(/^\/sandbox\/?/, "").replace(/^\/+/, "") || DEFAULT_WORKING_DIR;
}

function getDependencyStatusForToolResult(
  status: ReturnType<Sandbox["getDependencyInstallStatus"]>["status"],
): "pending" | "running" | "success" | "failed" | "not_required" {
  return status === "idle" ? "pending" : status;
}

export const UpdateDevServer = createTool({
  name: "updateDevServer",
  description: "同步启动或重启沙箱中的开发预览服务，并返回可直接打开的预览地址。",
  whenToUse:
    "当仓库已经可运行，需要同步等待 dev server 可用后再继续时使用。调用前应先确保项目配置与启动命令会监听 0.0.0.0:3000。",
  params: [
    {
      name: "startCommand",
      optional: false,
      description: "启动 dev server 的命令，例如 `npm run dev -- --host 0.0.0.0 --port 3000`。",
    },
    {
      name: "workingDir",
      optional: true,
      description: "命令执行目录，相对 /sandbox，默认仓库根目录。",
    },
  ],
  async invoke({ params, context }) {
    const startCommand = typeof params.startCommand === "string" ? params.startCommand.trim() : "";
    const workingDir = normalizeWorkingDir(
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

    const installStatus = await sandbox.ensureDependenciesInstalled({
      workingDir,
    });
    logger.info(
      `[updateDevServer] 依赖状态 task=${sandboxTaskId} status=${installStatus.status} packageManager=${installStatus.packageManager}`,
    );

    await sandbox.startOrUpdateDevServer({
      startCommand,
      workingDir,
    });

    const previewHostPort = sandbox.getPreviewHostPort();
    const logPath = sandbox.getPreviewLogPath();
    const dependencyStatus = getDependencyStatusForToolResult(installStatus.status);

    return {
      message: `开发预览已启动，可通过 Preview 打开（端口 ${previewHostPort || 0}）。`,
      toolResult: {
        status: "completed",
        port: previewHostPort,
        workingDir,
        startCommand,
        logPath,
        dependencyStatus,
      },
    };
  },
});

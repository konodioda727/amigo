import type { Sandbox } from "@/core/sandbox";
import { logger } from "@/utils/logger";
import { createTool } from "./base";
import { createToolResult } from "./result";

const DEFAULT_WORKING_DIR = ".";

function normalizeWorkingDir(input: string | undefined): string {
  const trimmed = (input || DEFAULT_WORKING_DIR).trim();
  if (!trimmed || trimmed === "/sandbox") {
    return DEFAULT_WORKING_DIR;
  }

  return trimmed.replace(/^\/sandbox\/?/, "").replace(/^\/+/, "") || DEFAULT_WORKING_DIR;
}

export const UpdateDevServer = createTool({
  name: "updateDevServer",
  description: "同步启动或重启沙箱中的开发预览服务，并返回可直接打开的预览地址。",
  whenToUse:
    "当仓库已经可运行，需要同步启动或重启 dev server 并拿到可打开的预览地址时使用。调用前必须先读取目标工作目录的 package.json 与相关 README/文档，确认真实脚本、包管理器和 host/port 参数；非必要不要使用 npm，优先沿用项目已有的 bun/pnpm/yarn 方案。依赖是否安装、是否需要先执行安装命令，由模型自己通过 bash 判断和处理，不要把这一步交给该工具。",
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

    await sandbox.startOrUpdateDevServer({
      startCommand,
      workingDir,
    });

    const previewHostPort = sandbox.getPreviewHostPort();
    const logPath = sandbox.getPreviewLogPath();

    return createToolResult(
      {
        status: "completed",
        port: previewHostPort,
        workingDir,
        startCommand,
        logPath,
      },
      {
        transportMessage: `开发预览已启动，可通过 Preview 打开（端口 ${previewHostPort || 0}）。`,
        continuationSummary: "【开发预览已启动】",
      },
    );
  },
});

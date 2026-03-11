import { z } from "zod";

export const InstallDependenciesSchema = z.object({
  name: z.literal("installDependencies"),
  params: z
    .object({
      installCommand: z.string().min(1).describe("由 AI 基于仓库文档和脚本自行决定的依赖安装命令"),
      workingDir: z
        .string()
        .optional()
        .describe("可选，依赖安装目录，相对 /sandbox，默认当前仓库根目录"),
    })
    .describe("依赖安装参数"),
  result: z.object({
    status: z
      .enum(["completed", "started", "already_running"])
      .describe("工具状态：已完成或已转为后台安装"),
    workingDir: z.string().describe("安装目录（相对 /sandbox）"),
    packageManager: z
      .enum(["pnpm", "npm", "yarn", "bun", "custom", "none"])
      .describe("依赖安装类型；AI 自定义命令时为 custom"),
    installCommand: z.string().describe("实际执行的安装命令"),
    logPath: z.string().describe("容器内日志文件路径"),
    jobId: z.string().optional().describe("后台安装任务编号"),
    startedAt: z.string().optional().describe("后台安装任务启动时间"),
    async: z.boolean().optional().describe("是否为后台异步安装"),
    dependencyStatus: z
      .enum(["pending", "running", "success", "failed", "not_required"])
      .describe("依赖安装状态"),
  }),
});

export type InstallDependenciesParams = z.infer<typeof InstallDependenciesSchema>["params"];
export type InstallDependenciesResult = z.infer<typeof InstallDependenciesSchema>["result"];

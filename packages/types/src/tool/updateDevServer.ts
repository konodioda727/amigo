import { z } from "zod";

export const UpdateDevServerSchema = z.object({
  name: z.literal("updateDevServer"),
  params: z
    .object({
      startCommand: z
        .string()
        .min(1)
        .describe("用于启动 dev server 的命令，需确保最终服务监听 0.0.0.0:3000"),
      workingDir: z
        .string()
        .optional()
        .describe("可选，启动命令执行目录，相对 /sandbox，默认当前仓库根目录"),
    })
    .describe("dev server 启动参数"),
  result: z.object({
    status: z.enum(["completed"]).describe("dev server 已同步启动完成"),
    port: z.number().int().positive().nullable().describe("对外暴露的预览端口"),
    workingDir: z.string().describe("启动目录（相对 /sandbox）"),
    startCommand: z.string().describe("实际执行的启动命令"),
    logPath: z.string().describe("容器内日志文件路径"),
  }),
});

export type UpdateDevServerParams = z.infer<typeof UpdateDevServerSchema>["params"];
export type UpdateDevServerResult = z.infer<typeof UpdateDevServerSchema>["result"];

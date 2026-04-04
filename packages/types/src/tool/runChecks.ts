import { z } from "zod";

const RunChecksStepSchema = z.object({
  name: z.string().describe("检查步骤名称"),
  command: z.string().describe("实际执行的检查命令"),
  status: z.enum(["running", "passed", "failed", "timeout", "blocked"]).describe("步骤状态"),
  exitCode: z.number().int().optional().describe("命令退出码"),
  durationMs: z.number().int().nonnegative().optional().describe("步骤耗时（毫秒）"),
  outputTail: z.string().optional().describe("输出尾部或错误摘要"),
});

export const RunChecksSchema = z.object({
  name: z.literal("runChecks"),
  params: z
    .object({
      preset: z
        .string()
        .optional()
        .describe("quick/lint/test/typecheck/build/all。仅在仓库脚本命名足够常规时使用"),
      workingDir: z.string().optional().describe("工作目录（相对 /sandbox）"),
      stopOnFail: z.boolean().optional().describe("遇到失败是否停止"),
      timeoutMs: z.number().int().positive().optional().describe("每步骤超时时间（毫秒）"),
      includeOutputTailLines: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("每步骤返回输出尾部行数"),
      commands: z
        .array(z.string().min(1))
        .optional()
        .describe("自定义检查命令列表；传入后覆盖 preset"),
    })
    .describe("统一检查工具参数"),
  result: z.object({
    success: z.boolean().describe("本次检查是否全部通过"),
    async: z.boolean().optional().describe("是否转入后台等待依赖完成后自动运行"),
    overallStatus: z
      .enum(["passed", "partial", "failed", "waiting_for_dependencies"])
      .describe("整体状态"),
    preset: z.string().describe("本次使用的预设标签或 custom"),
    workingDir: z.string().describe("执行目录（相对 /sandbox）"),
    failedSteps: z.array(z.string()).describe("失败步骤名称列表"),
    steps: z.array(RunChecksStepSchema).describe("结构化步骤结果"),
    dependencyStatus: z
      .enum(["pending", "running", "success", "failed", "not_required"])
      .optional()
      .describe("依赖安装状态"),
    jobId: z.string().optional().describe("等待依赖完成后自动续跑的后台任务编号"),
    message: z.string().describe("结果摘要"),
  }),
});

export type RunChecksParams = z.infer<typeof RunChecksSchema>["params"];
export type RunChecksResult = z.infer<typeof RunChecksSchema>["result"];

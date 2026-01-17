import { z } from "zod";

/**
 * Bash 工具 Schema
 * 用于在沙箱中执行 bash 命令
 */
export const BashSchema = z.object({
  name: z.literal("bash"),
  params: z
    .object({
      command: z.string().describe("要执行的 bash 命令"),
      workingDir: z.string().optional().describe("可选：工作目录（相对于沙箱根目录）"),
    })
    .describe("执行 bash 命令的参数"),
  result: z
    .object({
      success: z.boolean().describe("命令是否执行成功"),
      output: z.string().describe("命令输出"),
      exitCode: z.number().optional().describe("命令退出码"),
      message: z.string().describe("操作结果消息"),
    })
    .describe("执行 bash 命令的结果"),
});

/**
 * Bash 参数类型
 */
export type BashParams = z.infer<typeof BashSchema>["params"];

/**
 * Bash 结果类型
 */
export type BashResult = z.infer<typeof BashSchema>["result"];

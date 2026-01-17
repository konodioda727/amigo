import { z } from "zod";

/**
 * ReadFile 工具 Schema
 * 用于从沙箱中读取文件内容
 */
export const ReadFileSchema = z.object({
  name: z.literal("readFile"),
  params: z
    .object({
      filePath: z.string().describe("文件路径（相对于沙箱工作目录）"),
      startLine: z.number().optional().describe("可选：起始行号（从 1 开始）"),
      endLine: z.number().optional().describe("可选：结束行号（包含）"),
    })
    .describe("读取文件的参数"),
  result: z
    .object({
      success: z.boolean().describe("操作是否成功"),
      content: z.string().describe("文件内容"),
      filePath: z.string().describe("读取的文件路径"),
      message: z.string().describe("操作结果消息"),
      totalLines: z.number().optional().describe("文件总行数"),
    })
    .describe("读取文件的结果"),
});

/**
 * ReadFile 参数类型
 */
export type ReadFileParams = z.infer<typeof ReadFileSchema>["params"];

/**
 * ReadFile 结果类型
 */
export type ReadFileResult = z.infer<typeof ReadFileSchema>["result"];

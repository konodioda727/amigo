import { z } from "zod";

/**
 * ReadFile 工具 Schema
 * 用于从沙箱中读取文件内容
 */
export const ReadFileSchema = z.object({
  name: z.literal("readFile"),
  params: z
    .object({
      filePaths: z
        .array(z.string().min(1))
        .min(1)
        .describe("要读取的文件路径列表（支持相对于沙箱工作目录的路径或绝对路径）"),
      startLine: z.number().optional().describe("可选：起始行号（从 1 开始）"),
      endLine: z.number().optional().describe("可选：结束行号（包含）"),
    })
    .describe("读取文件的参数"),
  result: z
    .object({
      success: z.boolean().describe("操作是否成功"),
      filePaths: z.array(z.string()).describe("本次读取的全部文件路径"),
      files: z
        .array(
          z.object({
            success: z.boolean().describe("该文件是否读取成功"),
            content: z.string().describe("该文件的内容"),
            filePath: z.string().describe("该文件路径"),
            message: z.string().describe("该文件的读取结果"),
            totalLines: z.number().optional().describe("该文件总行数"),
          }),
        )
        .describe("逐文件读取结果"),
      message: z.string().describe("操作结果消息"),
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

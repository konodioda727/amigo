import { z } from "zod";

/**
 * EditFile 工具 Schema
 * 用于在沙箱中创建或修改文件
 */
export const EditFileSchema = z.object({
  name: z.literal("editFile"),
  params: z
    .object({
      filePath: z.string().describe("文件路径（相对于沙箱工作目录）"),
      content: z.string().describe("文件内容（全量写入）"),
      mode: z
        .enum(["create", "overwrite", "patch"])
        .default("overwrite")
        .describe("操作模式：create=仅创建新文件，overwrite=覆盖写入，patch=修改指定行"),
      startLine: z.number().optional().describe("patch 模式下的起始行号（从 1 开始）"),
      endLine: z.number().optional().describe("patch 模式下的结束行号（包含）"),
    })
    .describe("编辑文件的参数"),
  result: z
    .object({
      success: z.boolean().describe("操作是否成功"),
      filePath: z.string().describe("操作的文件路径"),
      message: z.string().describe("操作结果消息"),
      linesWritten: z.number().optional().describe("写入的行数"),
    })
    .describe("编辑文件的结果"),
});

/**
 * EditFile 参数类型
 */
export type EditFileParams = z.infer<typeof EditFileSchema>["params"];

/**
 * EditFile 结果类型
 */
export type EditFileResult = z.infer<typeof EditFileSchema>["result"];

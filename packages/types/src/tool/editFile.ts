import { z } from "zod";

/**
 * EditFile 工具 Schema
 * 用于在沙箱中创建或修改文件
 */
export const EditFileSchema = z.object({
  name: z.literal("editFile"),
  params: z
    .object({
      filePath: z.string().describe("文件路径（支持相对于沙箱工作目录的路径或绝对路径）"),
      content: z.string().optional().describe("文件内容（create/overwrite 或行号 patch 时使用）"),
      mode: z
        .enum(["create", "overwrite", "patch"])
        .default("overwrite")
        .describe("操作模式：create=仅创建新文件，overwrite=覆盖写入，patch=修改指定行"),
      startLine: z.number().optional().describe("patch 模式下的起始行号（从 1 开始）"),
      endLine: z.number().optional().describe("patch 模式下的结束行号（包含）"),
      search: z.string().optional().describe("patch 模式可选：按字符串搜索替换的 search 文本"),
      replace: z.string().optional().describe("patch 模式可选：按字符串搜索替换的 replace 文本"),
      replaceAll: z.boolean().optional().describe("patch 模式可选：是否替换所有匹配（默认 false）"),
      failIfNoMatch: z
        .boolean()
        .optional()
        .describe("patch 模式可选：无匹配时是否报错（默认 true）"),
    })
    .describe("编辑文件的参数"),
  result: z
    .object({
      success: z.boolean().describe("操作是否成功"),
      filePath: z.string().describe("操作的文件路径"),
      message: z.string().describe("操作结果消息"),
      linesWritten: z.number().optional().describe("写入的行数"),
      replacements: z.number().optional().describe("字符串替换模式下的替换次数"),
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

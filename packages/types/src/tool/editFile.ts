import { z } from "zod";

export const EditFileDiagnosticSchema = z.object({
  source: z.enum(["typescript", "python"]).describe("诊断来源"),
  severity: z.enum(["error", "warning"]).describe("诊断级别"),
  filePath: z.string().describe("诊断关联文件"),
  line: z.number().int().positive().describe("1-based 行号"),
  column: z.number().int().positive().optional().describe("1-based 列号"),
  endLine: z.number().int().positive().optional().describe("结束行号"),
  endColumn: z.number().int().positive().optional().describe("结束列号"),
  code: z.string().optional().describe("可选诊断代码"),
  message: z.string().describe("诊断消息"),
});

export const EditFileDiagnosticsSchema = z.object({
  language: z.enum(["typescript", "python"]).describe("检测语言"),
  status: z
    .enum(["clean", "error", "tool_unavailable"])
    .describe("检测状态：无错误、有错误、工具不可用"),
  summary: z.string().describe("诊断摘要"),
  errorCount: z.number().int().nonnegative().describe("错误总数"),
  diagnostics: z.array(EditFileDiagnosticSchema).describe("结构化诊断列表"),
});

/**
 * EditFile 工具 Schema
 * 用于在沙箱中创建或修改文件
 */
export const EditFileSchema = z.object({
  name: z.literal("editFile"),
  params: z
    .object({
      filePath: z.string().describe("文件路径（支持相对于沙箱工作目录的路径或绝对路径）"),
      content: z
        .string()
        .optional()
        .describe(
          "整文件写入时必填；按行修改时需与 startLine、endLine、expectedOriginalContent 一起提供",
        ),
      startLine: z
        .number()
        .optional()
        .describe("可选：起始行号（从 1 开始）。仅作为局部修改的定位提示"),
      endLine: z.number().optional().describe("可选：结束行号（包含）。仅作为局部修改的定位提示"),
      expectedOriginalContent: z
        .string()
        .optional()
        .describe(
          "按行修改时必填：startLine-endLine 当前应匹配的原文片段，必须与最新文件内容完全一致",
        ),
      oldString: z
        .string()
        .optional()
        .describe("可选：精确替换模式下要匹配的唯一原文片段，必须与文件内容完全一致"),
      newString: z.string().optional().describe("可选：与 oldString 配对使用，表示替换后的新文本"),
    })
    .describe("编辑文件的参数"),
  result: z
    .object({
      success: z.boolean().describe("操作是否成功"),
      filePath: z.string().describe("操作的文件路径"),
      message: z.string().describe("操作结果消息"),
      linesWritten: z.number().optional().describe("写入的行数"),
      diagnostics: EditFileDiagnosticsSchema.optional().describe("可选：编辑后的语法诊断结果"),
    })
    .describe("编辑文件的结果"),
});

/**
 * EditFile 参数类型
 */
export type EditFileParams = z.infer<typeof EditFileSchema>["params"];

export type EditFileDiagnostic = z.infer<typeof EditFileDiagnosticSchema>;

export type EditFileDiagnostics = z.infer<typeof EditFileDiagnosticsSchema>;

/**
 * EditFile 结果类型
 */
export type EditFileResult = z.infer<typeof EditFileSchema>["result"];

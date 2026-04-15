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

export const EditFileOperationInputSchema = z.object({
  filePath: z.string().describe("文件路径（支持相对于沙箱工作目录的路径或绝对路径）"),
  startLine: z
    .number()
    .optional()
    .describe("可选：起始行号（从 1 开始）。仅作为 oldString 搜索的定位提示"),
  endLine: z
    .number()
    .optional()
    .describe("可选：结束行号（包含）。与 startLine 一起用于缩小 oldString 搜索范围"),
  oldString: z
    .string()
    .optional()
    .describe(
      "可选：精确替换模式下要匹配的原文片段；默认需唯一命中，若传 startLine/endLine 则按定位提示缩小搜索范围",
    ),
  newString: z
    .string()
    .describe("整文件写入时直接作为完整文件内容；若同时提供 oldString，则表示精确替换后的新文本"),
});

export const EditFileSingleResultSchema = z.object({
  filePath: z.string().describe("操作的文件路径"),
  message: z.string().describe("该文件的操作结果消息"),
  linesWritten: z.number().optional().describe("该文件写入的行数"),
  diagnostics: EditFileDiagnosticsSchema.optional().describe("该文件的编辑后诊断结果"),
});

/**
 * EditFile 工具 Schema
 * 用于在沙箱中创建或修改文件
 */
export const EditFileSchema = z.object({
  name: z.literal("editFile"),
  params: z
    .object({
      filePath: z.string().optional().describe("单文件编辑时使用的文件路径"),
      startLine: z.number().optional().describe("单文件局部修改的起始行号提示（从 1 开始）"),
      endLine: z.number().optional().describe("单文件局部修改的结束行号提示（包含）"),
      oldString: z.string().optional().describe("单文件精确替换模式下要匹配的唯一原文片段"),
      newString: z
        .string()
        .optional()
        .describe("单文件整文件写入内容；若同时提供 oldString，则表示替换文本"),
      edits: z
        .array(EditFileOperationInputSchema)
        .min(1)
        .optional()
        .describe("可选：批量编辑列表。可一次修改多个文件，也可对同一文件做多处顺序修改"),
    })
    .superRefine((value, ctx) => {
      const hasEdits = Array.isArray(value.edits) && value.edits.length > 0;
      const hasSinglePath = typeof value.filePath === "string" && value.filePath.trim().length > 0;
      const hasSingleOperationFields =
        value.startLine !== undefined ||
        value.endLine !== undefined ||
        value.oldString !== undefined ||
        value.newString !== undefined;

      if (!hasEdits && !hasSinglePath) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "editFile 需要提供 filePath，或使用 edits 进行批量编辑",
        });
      }

      if (!hasEdits && hasSinglePath && typeof value.newString !== "string") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "单文件 editFile 需要提供 newString",
        });
      }

      if (hasEdits && (hasSinglePath || hasSingleOperationFields)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "使用 edits 批量编辑时，不要再传顶层 filePath/startLine/endLine/oldString/newString 等单文件参数",
        });
      }
    })
    .describe("编辑文件的参数"),
  result: z
    .object({
      success: z.boolean().describe("操作是否成功"),
      filePath: z.string().optional().describe("单文件模式下的文件路径"),
      message: z.string().describe("操作结果消息"),
      linesWritten: z.number().optional().describe("单文件模式下写入的行数"),
      diagnostics: EditFileDiagnosticsSchema.optional().describe("可选：编辑后的语法诊断结果"),
      edits: z
        .array(EditFileSingleResultSchema)
        .optional()
        .describe("批量编辑时每个文件的结果汇总"),
    })
    .describe("编辑文件的结果"),
});

/**
 * EditFile 参数类型
 */
export type EditFileParams = z.infer<typeof EditFileSchema>["params"];

export type EditFileDiagnostic = z.infer<typeof EditFileDiagnosticSchema>;

export type EditFileDiagnostics = z.infer<typeof EditFileDiagnosticsSchema>;
export type EditFileOperationInput = z.infer<typeof EditFileOperationInputSchema>;
export type EditFileSingleResult = z.infer<typeof EditFileSingleResultSchema>;

/**
 * EditFile 结果类型
 */
export type EditFileResult = z.infer<typeof EditFileSchema>["result"];

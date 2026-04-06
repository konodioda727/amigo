import { z } from "zod";

/**
 * 文档类型枚举
 */
export const TaskDocPhaseSchema = z.enum(["requirements", "design", "taskList"]);

/**
 * 读取文档时的扩展类型（包含 'all'）
 */
export const TaskDocReadPhaseSchema = z.enum(["requirements", "design", "taskList", "all"]);

export const TaskDocReadEntrySchema = z.object({
  content: z.string().describe("文档原始内容"),
  numberedContent: z.string().describe("带 1-based 行号的文档内容"),
  totalLines: z.number().int().nonnegative().describe("文档总行数"),
  startLine: z.number().int().positive().describe("本次返回内容的起始行号"),
  endLine: z.number().int().nonnegative().describe("本次返回内容的结束行号"),
});

/**
 * ReadTaskDocs 工具 Schema
 * 用于读取当前任务的文档
 */
export const ReadTaskDocsSchema = z.object({
  name: z.literal("readTaskDocs"),
  params: z
    .object({
      phase: TaskDocReadPhaseSchema.describe("要读取的文档类型，或 'all' 读取所有文档"),
    })
    .describe("读取任务文档的参数"),
  result: z
    .object({
      success: z.boolean().describe("操作是否成功"),
      documents: z
        .object({
          requirements: TaskDocReadEntrySchema.optional().describe("需求文档内容"),
          design: TaskDocReadEntrySchema.optional().describe("设计文档内容"),
          taskList: TaskDocReadEntrySchema.optional().describe("任务列表文档内容"),
        })
        .describe("读取到的文档内容"),
      message: z.string().describe("操作结果消息"),
    })
    .describe("读取文档的结果"),
});

/**
 * UpdateTaskDocs 工具 Schema
 * 用于对任务文档进行受保护的渐进式修改
 */
export const UpdateTaskDocsSchema = z.object({
  name: z.literal("updateTaskDocs"),
  params: z
    .object({
      phase: TaskDocPhaseSchema.describe("文档类型：requirements、design、taskList"),
      content: z
        .string()
        .optional()
        .describe(
          "整篇重写时必填；按行修改时需与 startLine、endLine、expectedOriginalContent 一起提供",
        ),
      startLine: z
        .number()
        .optional()
        .describe("可选：起始行号（从 1 开始），仅作为局部修改定位提示"),
      endLine: z.number().optional().describe("可选：结束行号（包含），仅作为局部修改定位提示"),
      expectedOriginalContent: z
        .string()
        .optional()
        .describe(
          "按行修改时必填：startLine-endLine 当前应匹配的原文片段，必须与最新 readTaskDocs 返回内容完全一致",
        ),
      oldString: z
        .string()
        .optional()
        .describe("可选：精确替换模式下要匹配的唯一原文片段，必须与文档内容完全一致"),
      newString: z.string().optional().describe("可选：与 oldString 配对使用，表示替换后的新文本"),
    })
    .describe("更新任务文档的参数"),
  result: z
    .object({
      success: z.boolean().describe("操作是否成功"),
      filePath: z.string().describe("操作的文件路径"),
      message: z.string().describe("操作结果消息"),
      updatedContent: z.string().optional().describe("更新后的完整文档内容"),
      linesWritten: z.number().optional().describe("本次写入的行数"),
    })
    .describe("更新任务文档的结果"),
});

/**
 * ReadTaskDocs 参数类型
 */
export type ReadTaskDocsParams = z.infer<typeof ReadTaskDocsSchema>["params"];

/**
 * ReadTaskDocs 结果类型
 */
export type ReadTaskDocsResult = z.infer<typeof ReadTaskDocsSchema>["result"];

/**
 * UpdateTaskDocs 参数类型
 */
export type UpdateTaskDocsParams = z.infer<typeof UpdateTaskDocsSchema>["params"];

/**
 * UpdateTaskDocs 结果类型
 */
export type UpdateTaskDocsResult = z.infer<typeof UpdateTaskDocsSchema>["result"];

/**
 * ExecuteTaskList 工具 Schema
 * 用于执行当前任务的 taskList.md 中的任务
 */
export const ExecuteTaskListSchema = z.object({
  name: z.literal("executeTaskList"),
  params: z.object({}).describe("执行任务列表的参数（无需参数）"),
  result: z
    .object({
      success: z.boolean().describe("操作是否成功"),
      message: z.string().describe("操作结果消息"),
      async: z.boolean().optional().describe("是否以异步后台任务执行"),
      status: z.enum(["started", "already_running"]).optional().describe("后台任务状态"),
      executionId: z.string().optional().describe("后台任务编号"),
      startedAt: z.string().optional().describe("后台任务启动时间"),
      pending: z.number().optional().describe("待执行任务数"),
      alreadyRunning: z.boolean().optional().describe("是否已有同类后台任务在运行"),
      executed: z.boolean().optional().describe("是否执行了任务"),
      executionResults: z
        .array(
          z.object({
            target: z.string().describe("任务目标"),
            summary: z.string().describe("执行结果摘要"),
            requestedTools: z.number().describe("请求的工具数量"),
            availableTools: z.number().describe("可用的工具数量"),
            invalidTools: z.array(z.string()).optional().describe("无效的工具列表"),
          }),
        )
        .optional()
        .describe("任务执行结果列表"),
    })
    .describe("执行任务列表的结果"),
});

/**
 * ExecuteTaskList 参数类型
 */
export type ExecuteTaskListParams = z.infer<typeof ExecuteTaskListSchema>["params"];

/**
 * ExecuteTaskList 结果类型
 */
export type ExecuteTaskListResult = z.infer<typeof ExecuteTaskListSchema>["result"];

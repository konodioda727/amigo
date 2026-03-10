import { z } from "zod";

/**
 * 文档类型枚举
 */
export const TaskDocPhaseSchema = z.enum(["requirements", "design", "taskList"]);

/**
 * 读取文档时的扩展类型（包含 'all'）
 */
export const TaskDocReadPhaseSchema = z.enum(["requirements", "design", "taskList", "all"]);

/**
 * CreateTaskDocs 工具 Schema
 * 用于创建当前任务的文档（每个任务只有三个固定文档）
 */
export const CreateTaskDocsSchema = z.object({
  name: z.literal("createTaskDocs"),
  params: z
    .object({
      phase: TaskDocPhaseSchema.describe("文档类型：requirements、design、taskList"),
      content: z.string().describe("文档内容，使用 Markdown 格式"),
    })
    .describe("创建任务文档的参数"),
  result: z
    .object({
      success: z.boolean().describe("操作是否成功"),
      filePath: z.string().describe("创建的文件路径"),
      message: z.string().describe("操作结果消息"),
    })
    .describe("创建文档的结果"),
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
          requirements: z.string().optional().describe("需求文档内容"),
          design: z.string().optional().describe("设计文档内容"),
          taskList: z.string().optional().describe("任务列表文档内容"),
        })
        .describe("读取到的文档内容"),
      message: z.string().describe("操作结果消息"),
    })
    .describe("读取文档的结果"),
});

/**
 * CreateTaskDocs 参数类型
 */
export type CreateTaskDocsParams = z.infer<typeof CreateTaskDocsSchema>["params"];

/**
 * CreateTaskDocs 结果类型
 */
export type CreateTaskDocsResult = z.infer<typeof CreateTaskDocsSchema>["result"];

/**
 * ReadTaskDocs 参数类型
 */
export type ReadTaskDocsParams = z.infer<typeof ReadTaskDocsSchema>["params"];

/**
 * ReadTaskDocs 结果类型
 */
export type ReadTaskDocsResult = z.infer<typeof ReadTaskDocsSchema>["result"];

/**
 * 任务进度统计 Schema
 */
export const TaskProgressSchema = z.object({
  total: z.number().describe("总任务数"),
  completed: z.number().describe("已完成任务数"),
  remaining: z.number().describe("剩余任务数"),
  percentage: z.number().describe("完成百分比"),
});

/**
 * GetTaskListProgress 工具 Schema
 * 用于获取当前任务的 taskList.md 进度统计
 */
export const GetTaskListProgressSchema = z.object({
  name: z.literal("getTaskListProgress"),
  params: z.object({}).describe("获取任务进度的参数（无需参数）"),
  result: z
    .object({
      success: z.boolean().describe("操作是否成功"),
      message: z.string().describe("操作结果消息"),
      progress: TaskProgressSchema.optional().describe("进度统计"),
      isAllCompleted: z.boolean().optional().describe("是否所有任务都已完成"),
      pendingTasks: z.array(z.string()).optional().describe("待完成任务列表"),
      completedTasks: z.array(z.string()).optional().describe("已完成任务列表"),
    })
    .describe("获取任务进度的结果"),
});

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
 * GetTaskListProgress 参数类型
 */
export type GetTaskListProgressParams = z.infer<typeof GetTaskListProgressSchema>["params"];

/**
 * GetTaskListProgress 结果类型
 */
export type GetTaskListProgressResult = z.infer<typeof GetTaskListProgressSchema>["result"];

/**
 * ExecuteTaskList 参数类型
 */
export type ExecuteTaskListParams = z.infer<typeof ExecuteTaskListSchema>["params"];

/**
 * ExecuteTaskList 结果类型
 */
export type ExecuteTaskListResult = z.infer<typeof ExecuteTaskListSchema>["result"];

/**
 * 任务进度类型
 */
export type TaskProgress = z.infer<typeof TaskProgressSchema>;

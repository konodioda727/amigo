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
 * 用于在沙箱中创建任务文档
 */
export const CreateTaskDocsSchema = z.object({
  name: z.literal("createTaskDocs"),
  params: z
    .object({
      taskName: z.string().describe("任务名称，将自动转换为 kebab-case 格式"),
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
 * 用于从沙箱中读取任务文档
 */
export const ReadTaskDocsSchema = z.object({
  name: z.literal("readTaskDocs"),
  params: z
    .object({
      taskName: z.string().describe("任务名称，将自动转换为 kebab-case 格式"),
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
 * UpdateTaskList 工具 Schema
 * 用于更新 taskList.md 中的任务状态
 */
export const UpdateTaskListSchema = z.object({
  name: z.literal("updateTaskList"),
  params: z
    .object({
      taskName: z.string().describe("任务名称，将自动转换为 kebab-case 格式"),
      taskDescription: z.string().describe("要更新的任务描述，必须精确匹配"),
      completed: z.union([z.boolean(), z.string()]).describe("任务是否完成"),
    })
    .describe("更新任务状态的参数"),
  result: z
    .object({
      success: z.boolean().describe("操作是否成功"),
      message: z.string().describe("操作结果消息"),
      progress: TaskProgressSchema.optional().describe("更新后的进度统计"),
      availableTasks: z
        .array(z.string())
        .optional()
        .describe("可用的任务列表（当找不到匹配任务时返回）"),
    })
    .describe("更新任务状态的结果"),
});

/**
 * GetTaskListProgress 工具 Schema
 * 用于获取 taskList.md 的进度统计
 */
export const GetTaskListProgressSchema = z.object({
  name: z.literal("getTaskListProgress"),
  params: z
    .object({
      taskName: z.string().describe("任务名称，将自动转换为 kebab-case 格式"),
    })
    .describe("获取任务进度的参数"),
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
 * UpdateTaskList 参数类型
 */
export type UpdateTaskListParams = z.infer<typeof UpdateTaskListSchema>["params"];

/**
 * UpdateTaskList 结果类型
 */
export type UpdateTaskListResult = z.infer<typeof UpdateTaskListSchema>["result"];

/**
 * GetTaskListProgress 参数类型
 */
export type GetTaskListProgressParams = z.infer<typeof GetTaskListProgressSchema>["params"];

/**
 * GetTaskListProgress 结果类型
 */
export type GetTaskListProgressResult = z.infer<typeof GetTaskListProgressSchema>["result"];

/**
 * 任务进度类型
 */
export type TaskProgress = z.infer<typeof TaskProgressSchema>;

import { z } from "zod";

export const TaskListSchema = z.object({
  name: z.literal("assignTasks"),
  params: z
    .object({
      taskName: z
        .string()
        .describe(
          "任务名称，必须与之前使用 createTaskDocs 创建的任务名称一致。系统会自动转换为 kebab-case 格式并读取对应的 taskList.md 文档。",
        ),
    })
    .describe("包含任务名称的参数对象"),
  result: z
    .object({
      success: z.boolean().describe("任务分配是否成功"),
      taskName: z.string().optional().describe("任务名称"),
      totalTasks: z.number().optional().describe("总任务数"),
      executedTasks: z.number().optional().describe("已执行任务数"),
      message: z.string().optional().describe("执行结果消息"),
    })
    .describe("任务分配执行结果"),
});

import { z } from "zod";

export const AssignTasksSchema = z.object({
  tools: z
    .array(z.string())
    .describe("对应子代理可使用的工具名称列表，例如: ['FlightSearchTool', 'HotelBookingTool']"),
});

export const TaskItemSchema = z.object({
  target: z.string().describe("Task 的目标描述，例如: '查询北京到上海的往返机票'"),
  subAgentPrompt: z.string().describe("对应子代理的系统提示词（System Prompt）"),
  tools: z.array(z.string()).describe("对应子代理可使用的工具名称列表"),
});

export const TaskListSchema = z.object({
  name: z.literal("assignTasks"),
  params: z
    .object({
      tasklist: z.array(TaskItemSchema).describe("分解后的多步骤待办事项列表。"),
    })
    .describe("包含用户输入和可用工具的参数对象"),
  result: z
    .object({
      tasklist: z.array(TaskItemSchema),
    })
    .describe("已成功创建任务列表"),
});

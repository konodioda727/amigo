import { z } from "zod";

export const TaskListItemInputSchema = z.object({
  id: z.string().describe("任务 ID，例如 T1、task-a、1.1"),
  title: z.string().describe("任务标题/描述，不含 Task <ID> 前缀"),
  deps: z.array(z.string()).optional().describe('依赖任务 ID 列表，例如 ["init-repo"]'),
});

export const TaskListItemResultSchema = z.object({
  id: z.string().describe("任务 ID，例如 T1、task-a、1.1"),
  title: z.string().describe("任务标题/描述"),
  deps: z.array(z.string()).describe("依赖任务 ID 列表"),
  completed: z.boolean().describe("当前是否已完成"),
});

export const TaskListSchema = z.object({
  name: z.literal("taskList"),
  params: z
    .object({
      action: z
        .enum(["read", "replace", "execute"])
        .optional()
        .describe(
          "read 读取当前 taskList；replace 仅更新 taskList；execute 执行 taskList，且可选地先用传入 tasks 全量替换",
        ),
      tasks: z
        .array(TaskListItemInputSchema)
        .optional()
        .describe("replace / execute 时可选传入的任务列表"),
      taskId: z
        .string()
        .optional()
        .describe("可选：目标任务 ID。默认读取/更新当前 taskList；子任务可传父任务 ID"),
    })
    .describe("读取或执行当前任务的 taskList"),
  result: z
    .object({
      success: z.boolean().describe("操作是否成功"),
      taskId: z.string().optional().describe("本次实际读取/更新的任务 ID"),
      filePath: z.string().describe("taskList 文件路径"),
      markdown: z.string().describe("taskList 的 markdown checklist 内容"),
      tasks: z.array(TaskListItemResultSchema).describe("当前 taskList 条目"),
      message: z.string().describe("操作结果消息"),
      status: z.enum(["completed", "partial"]).optional().describe("execute 模式下的执行状态"),
      taskListUpdated: z.boolean().optional().describe("execute 模式下，本轮是否先更新了 taskList"),
      pending: z.number().optional().describe("execute 模式下的待执行任务数"),
      executed: z.number().optional().describe("execute 模式下本轮实际执行的任务数"),
      successCount: z.number().optional().describe("execute 模式下的成功任务数"),
      failedCount: z.number().optional().describe("execute 模式下的失败任务数"),
      interruptedCount: z.number().optional().describe("execute 模式下的中断任务数"),
      blockedCount: z.number().optional().describe("execute 模式下的未执行任务数"),
      executionResults: z
        .array(
          z.object({
            target: z.string().describe("任务目标"),
            success: z.boolean().describe("该任务是否最终成功"),
            outcome: z.enum(["success", "failed", "interrupted"]).describe("该任务结果"),
            summary: z.string().describe("执行结果摘要"),
            ignoredLegacyTools: z
              .array(z.string())
              .optional()
              .describe("已忽略的旧版 [tools: ...] 工具配置"),
          }),
        )
        .optional()
        .describe("execute 模式下的任务执行结果列表"),
    })
    .describe("taskList 工具结果"),
});

export type TaskListParams = z.infer<typeof TaskListSchema>["params"];
export type TaskListResult = z.infer<typeof TaskListSchema>["result"];

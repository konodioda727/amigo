import { z } from "zod";

/**
 * 删除任务消息
 */
export const DeleteTaskSchema = z.object({
  type: z.literal("deleteTask"),
  data: z.object({
    taskId: z.string().describe("要删除的任务 ID"),
  }),
});

export type DeleteTaskMessage = z.infer<typeof DeleteTaskSchema>;

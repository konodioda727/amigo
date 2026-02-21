import { z } from "zod";

/**
 * 任务删除成功消息
 */
export const TaskDeletedSchema = z.object({
  type: z.literal("taskDeleted"),
  data: z.object({
    taskId: z.string().describe("被删除的任务 ID"),
    deletedSubTaskIds: z.array(z.string()).describe("一并删除的子任务 ID 列表"),
  }),
});

export type TaskDeletedMessage = z.infer<typeof TaskDeletedSchema>;

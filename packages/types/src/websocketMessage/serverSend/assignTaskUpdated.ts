import { z } from "zod";

export const AssignTaskUpdatedMessageSchema = z.object({
  type: z.literal("assignTaskUpdated"),
  data: z.object({
    index: z.number(),
    taskId: z.string(),
    parentTaskId: z.string().optional(),
  }),
});
// assignTaskUpdated.ts

export const SERVER_SEND_ASSIGN_TASK_UPDATED = "assignTaskUpdated" as const;

export interface ServerSendAssignTaskUpdated {
  type: typeof SERVER_SEND_ASSIGN_TASK_UPDATED;
  data: {
    /** assignTask 的 index，下标即可 */
    index: number;
    /** 分配到的 taskId */
    taskId: string;
    /** 可选，父任务 id */
    parentTaskId?: string;
  };
}
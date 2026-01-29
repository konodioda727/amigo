import { z } from "zod";
import type { SubTaskStatus } from "../../storage";

export const TaskStatusMapUpdatedMessageSchema = z.object({
  type: z.literal("taskStatusMapUpdated"),
  data: z.object({
    taskId: z.string(),
    subTasks: z.record(z.string(), z.any()), // Use any for now or a proper zod schema for SubTaskStatus
  }),
});

export type TaskStatusMapUpdatedData = {
  taskId: string;
  subTasks: Record<string, SubTaskStatus>;
};

import { z } from "zod";
import type { ContextUsageStatus, SubTaskStatus } from "../../storage";

export const TaskStatusMapUpdatedMessageSchema = z.object({
  type: z.literal("taskStatusMapUpdated"),
  data: z.object({
    taskId: z.string(),
    subTasks: z.record(z.string(), z.any()), // Use any for now or a proper zod schema for SubTaskStatus
    autoApproveToolNames: z.array(z.string()).optional(),
    contextUsage: z.any().optional(),
  }),
});

export type TaskStatusMapUpdatedData = {
  taskId: string;
  subTasks: Record<string, SubTaskStatus>;
  autoApproveToolNames?: string[];
  contextUsage?: ContextUsageStatus;
};

import { z } from "zod";
import type { ContextUsageStatus, ExecutionTaskStatus } from "../../storage";
import type { WorkflowState } from "../../workflow";

export const TaskStatusMapUpdatedMessageSchema = z.object({
  type: z.literal("taskStatusMapUpdated"),
  data: z.object({
    taskId: z.string(),
    executionTasks: z.record(z.string(), z.any()), // Use any for now or a proper zod schema for ExecutionTaskStatus
    autoApproveToolNames: z.array(z.string()).optional(),
    contextUsage: z.any().optional(),
    context: z.any().optional(),
    workflowState: z.any().optional(),
  }),
});

export type TaskStatusMapUpdatedData = {
  taskId: string;
  executionTasks: Record<string, ExecutionTaskStatus>;
  autoApproveToolNames?: string[];
  contextUsage?: ContextUsageStatus;
  context?: unknown;
  workflowState?: WorkflowState;
};

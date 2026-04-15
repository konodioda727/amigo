import { z } from "zod";
import { WorkflowStateSchema } from "../../workflow";

export const TaskHistoryMessageSchema = z.object({
  type: z.literal("taskHistory"),
  data: z.object({
    messages: z.array(z.any()),
    taskId: z.string(),
    workflowState: WorkflowStateSchema.optional(),
    conversationStatus: z
      .enum([
        "streaming",
        "aborted",
        "idle",
        "completed",
        "waiting_tool_confirmation",
        "tool_executing",
        "error",
      ])
      .optional(),
  }),
});

export type taskHistoryMessageData = z.infer<typeof TaskHistoryMessageSchema>["data"];

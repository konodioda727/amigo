import { z } from "zod";

export const WaitingToolCallMessageSchema = z.object({
  type: z.literal("waiting_tool_call"),
  data: z.object({
    taskId: z.string(),
    toolName: z.string(),
    params: z.any().optional(),
  }),
});

export type WaitingToolCallMessage = z.infer<typeof WaitingToolCallMessageSchema>;

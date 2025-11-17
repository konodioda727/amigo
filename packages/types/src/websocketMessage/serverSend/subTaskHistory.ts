import { z } from "zod";

export const SubTaskHistoryMessageSchema = z.object({
  type: z.literal("subTaskHistory"),
  data: z.object({
    messages: z.array(z.any()),
    taskId: z.string()
  }),
});

export type subTaskHistoryMessageData = z.infer<typeof SubTaskHistoryMessageSchema>["data"];

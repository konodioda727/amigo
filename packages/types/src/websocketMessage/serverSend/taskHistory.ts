import { z } from "zod";

export const TaskHistoryMessageSchema = z.object({
  type: z.literal("taskHistory"),
  data: z.object({
    messages: z.array(z.any()),
    taskId: z.string()
  }),
});

export type taskHistoryMessageData = z.infer<typeof TaskHistoryMessageSchema>["data"];

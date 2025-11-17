import { z } from "zod";

export const InterruptMessageSchema = z.object({
  type: z.literal("interrupt"),
  data: z.object({
    taskId: z.string(),
    updateTime: z.number(),
  }),
});

export type InterruptMessageData = z.infer<typeof InterruptMessageSchema>["data"];

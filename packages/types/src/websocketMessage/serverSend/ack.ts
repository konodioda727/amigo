import { z } from "zod";

export const AckMessageSchema = z.object({
  type: z.literal("ack"),
  data: z.object({
    taskId: z.string(),
    targetMessage: z.any(),
    status: z.enum(['pending', 'acked', 'failed'])
  }),
});

export type AckMessageData = z.infer<typeof AckMessageSchema>["data"];

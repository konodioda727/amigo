import { z } from "zod";

export const SessionHistoriesMessageSchema = z.object({
  type: z.literal("sessionHistories"),
  data: z.object({
    sessionHistories: z.array(
      z.object({
        taskId: z.string(),
        title: z.string(),
        updatedAt: z.string(),
      })
    ),
  }),
});

export type SessionHistoriesMessageData = z.infer<typeof SessionHistoriesMessageSchema>["data"];

import { z } from "zod";

export const ConversationOverSchema = z.object({
  type: z.literal("conversationOver"),
  data: z.object({
    taskId: z.string().optional(),
    reason: z
      .enum(["askFollowupQuestion", "finishPhase", "interrupt", "error", "message", "tool"])
      .optional(),
  }),
});

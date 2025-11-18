import { z } from "zod";

export const ConversationOverSchema = z.object({
  type: z.literal("conversationOver"),
  data: z.object({
    reason: z.enum(["askFollowupQuestion", "completionResult", "interrupt", "error"]).optional(),
  }),
});

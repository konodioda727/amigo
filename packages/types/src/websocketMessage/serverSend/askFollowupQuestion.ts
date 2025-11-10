import { z } from "zod";

export const AskFollowupQuestionSchema = z.object({
  type: z.literal("askFollowupQuestion"),
  data: z.object({
    message: z.string(),
  }),
});
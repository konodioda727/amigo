import { z } from "zod";

export const AskFollowupQuestionSchema = z.object({
  type: z.literal("askFollowupQuestion"),
  data: z.object({
    question: z.string().describe("The main question to ask the user."),
    suggestOptions: z
      .array(z.string())
      .min(1)
      .max(5)
      .describe("A list of suggested options for the user to choose from.")
      .optional(),
  }),
});
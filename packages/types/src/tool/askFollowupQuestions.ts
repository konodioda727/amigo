import { z } from "zod";

export const AskFollowupQuestionSchema = z.object({
  name: z.literal("askFollowupQuestion"),
  params: z.object({
    question: z.string().describe("The main question to ask the user."),
    suggestOptions: z.array(z.string()).min(1).max(5).describe("A list of suggested options for the user to choose from.").optional(),
  }),
  result: z.string().describe("已向用户提出后续问题"),
});
import { z } from "zod";

export const CompletionResultSchema = z.object({
  name: z.literal("completionResult"),
  params: z.string().describe("最终的完整回答内容"),
  result: z.string().describe("任务完成，已向用户提供最终结论"),
});

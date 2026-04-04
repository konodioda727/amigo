import { z } from "zod";

export const CompletionResultSchema = z.object({
  name: z.literal("completionResult"),
  params: z
    .object({
      summary: z
        .string()
        .describe(
          "本轮累计结果摘要，简短说明截至当前为止的目标完成情况、关键改动和当前状态（1-2句话）",
        ),
      result: z
        .string()
        .describe(
          "截至当前为止的累计结果说明，使用 Markdown 输出，必须覆盖已完成改动、目标完成情况、当前状态以及剩余事项/后续安排（如有）",
        ),
    })
    .describe("主任务本轮收尾结果"),
  result: z.string().describe("主任务已显式结束本轮输出"),
});

export type CompletionResultParams = z.infer<typeof CompletionResultSchema>["params"];
export type CompletionResultResult = z.infer<typeof CompletionResultSchema>["result"];

import { z } from "zod";

export const SubmitTaskReviewSchema = z.object({
  name: z.literal("submitTaskReview"),
  params: z.object({
    decision: z.enum(["approve", "request_changes"]).describe("审查裁决：批准或打回修改"),
    summary: z.string().describe("一句话总结审查结论"),
    feedback: z
      .string()
      .optional()
      .describe("若打回修改，写给 builder 的具体修改意见；批准时可省略"),
  }),
  result: z.object({
    success: z.boolean().describe("是否成功提交审查结果"),
    decision: z.enum(["approve", "request_changes"]).describe("审查裁决"),
    summary: z.string().describe("审查结论摘要"),
    feedback: z.string().optional().describe("可选：打回修改意见"),
    message: z.string().describe("工具执行消息"),
  }),
});

export type SubmitTaskReviewParams = z.infer<typeof SubmitTaskReviewSchema>["params"];
export type SubmitTaskReviewResult = z.infer<typeof SubmitTaskReviewSchema>["result"];

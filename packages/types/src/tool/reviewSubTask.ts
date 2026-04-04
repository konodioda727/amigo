import { z } from "zod";

export const ReviewSubTaskSchema = z.object({
  name: z.literal("reviewSubTask"),
  params: z.object({
    subTaskId: z.string().describe("待审阅的子任务 ID"),
    decision: z
      .enum(["approve", "request_changes"])
      .describe("审阅决定：approve 表示通过，request_changes 表示打回修改"),
    feedback: z.string().optional().describe("打回修改时给子任务的具体意见；approve 时可选"),
  }),
  result: z.object({
    success: z.boolean(),
    status: z.enum(["approved", "rework_started", "error"]),
    subTaskId: z.string(),
    message: z.string(),
  }),
});

export type ReviewSubTaskParams = z.infer<typeof ReviewSubTaskSchema>["params"];
export type ReviewSubTaskResult = z.infer<typeof ReviewSubTaskSchema>["result"];

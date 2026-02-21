import { z } from "zod";

export const CompleteTaskSchema = z.object({
  name: z.literal("completeTask"),
  params: z
    .object({
      summary: z.string().describe("任务完成摘要，简短描述完成了什么（1-2句话，用于父任务的通知）"),
      result: z.string().describe("任务完成的详细结果，使用 Markdown 格式输出完整内容"),
      achievements: z
        .string()
        .optional()
        .describe("可选：达到的效果或关键成果（如：创建了3个文件、修复了2个bug等）"),
      usage: z
        .string()
        .optional()
        .describe("可选：如何使用结果的说明（如：运行命令、访问URL、查看文件等）"),
    })
    .describe("任务完成参数"),
  result: z.string().describe("任务已完成并更新父任务待办列表"),
});

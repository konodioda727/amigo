import { z } from "zod";

export const CompleteTaskSchema = z.object({
  name: z.literal("completeTask"),
  params: z
    .object({
      summary: z
        .string()
        .describe("任务完成摘要。主任务用于简短面向用户总结；子任务用于父任务自动验收与通知。"),
      result: z
        .string()
        .describe(
          "任务完成的详细结果。主任务：面向用户清晰说明最终结果，无固定格式要求。子任务：必须包含 `## 交付物`、`## 验证`、`## 遗留问题`、`## 下游说明` 四个二级标题。",
        ),
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

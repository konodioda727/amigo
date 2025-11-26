import { z } from 'zod'

export const CallSubTaskSchema = z.object({
  type: z.literal('callSubTask'),
  data: z.object({
    taskId: z.string(),      // 主任务 ID
    subTaskId: z.string(),   // 子任务 ID
    message: z.string(),     // 发送的消息内容
  }),
});

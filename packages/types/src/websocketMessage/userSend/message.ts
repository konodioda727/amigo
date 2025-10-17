import { z } from 'zod'

export const MessageSchema = z.object({
  type: z.literal('userSendMessage'),
  data: z.object({
    message: z.string(),
    taskId: z.string(),
  }),
});
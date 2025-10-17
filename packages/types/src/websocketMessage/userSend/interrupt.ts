import { z } from 'zod'

export const IntertuptSchema = z.object({
  type: z.literal('interrupt'),
  data: z.object({
    taskId: z.string()
  }),
});
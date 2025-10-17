import { z } from 'zod'

export const ConnectedSchema = z.object({
  type: z.literal('connected'),
  data: z.object({
    message: z.string(),
    sessionHistories: z.array(z.object({
      taskId: z.string(),
      title: z.string(),
    })).optional(),
  }),
});
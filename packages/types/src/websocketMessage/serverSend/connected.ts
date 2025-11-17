import { z } from 'zod'

export const ConnectedSchema = z.object({
  type: z.literal('connected'),
  data: z.object({
    message: z.string(),
  }),
});
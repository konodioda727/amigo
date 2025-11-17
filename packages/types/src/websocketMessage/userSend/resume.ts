import { z } from 'zod'

export const ResumeSchema = z.object({
  type: z.literal('resume'),
  data: z.object({
    taskId: z.string(),
  }),
});

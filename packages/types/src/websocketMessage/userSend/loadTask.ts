import { z } from 'zod';

export const LoadTaskSchema = z.object({
  type: z.literal('loadTask'),
  data: z.object({
    taskId: z.string(),
  }),
});
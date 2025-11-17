import { z } from 'zod';

export const LoadSubTaskSchema = z.object({
  type: z.literal('loadSubTask'),
  data: z.object({
    taskId: z.string(),
  }),
});

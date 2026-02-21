import { z } from "zod";

export const RejectSchema = z.object({
  type: z.literal("reject"),
  data: z.object({
    taskId: z.string(),
  }),
});

export type RejectMessage = z.infer<typeof RejectSchema>;

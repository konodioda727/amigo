import { z } from "zod";

export const ConfirmSchema = z.object({
  type: z.literal("confirm"),
  data: z.object({
    taskId: z.string(),
  }),
});

export type ConfirmMessage = z.infer<typeof ConfirmSchema>;

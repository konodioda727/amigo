import { z } from "zod";

export const AlertMessageSchema = z.object({
  type: z.literal("alert"),
  data: z.object({
    message: z.string(),
    severity: z.enum(["info", "warning", "error"]),
    updateTime: z.number(),
  }),
});

export type AlertMessage = z.infer<typeof AlertMessageSchema>;

import { z } from "zod";

export const CommonMessageSchema = z.object({
  type: z.literal("message"),
  data: z.object({
    message: z.string(),
  }),
});

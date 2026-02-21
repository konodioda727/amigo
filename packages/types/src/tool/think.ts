import { z } from "zod";

export const ThinkSchema = z.object({
  name: z.literal("think"),
  params: z.string(),
  result: z.string(),
});

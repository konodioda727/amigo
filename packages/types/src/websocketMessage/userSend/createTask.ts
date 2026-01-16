import { z } from "zod";

export const CreateTaskSchema = z.object({
  type: z.literal("createTask"),
  data: z.object({
    message: z.string(),
  }),
});

import { z } from "zod";
import { UserMessageAttachmentSchema } from "./message";

export const CreateTaskSchema = z.object({
  type: z.literal("createTask"),
  data: z.object({
    message: z.string(),
    attachments: z.array(UserMessageAttachmentSchema).optional(),
    context: z.any().optional(),
  }),
});

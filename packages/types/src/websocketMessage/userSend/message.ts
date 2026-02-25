import { z } from "zod";

export const UserMessageAttachmentKindSchema = z.enum(["image", "video", "audio", "file"]);

export const UserMessageAttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().nonnegative(),
  kind: UserMessageAttachmentKindSchema,
  // Public or signed URL from object storage (OSS)
  url: z.string().url(),
});

export type UserMessageAttachment = z.infer<typeof UserMessageAttachmentSchema>;

export const UserSendMessageSchema = z.object({
  type: z.literal("userSendMessage"),
  data: z.object({
    message: z.string(),
    taskId: z.string(),
    attachments: z.array(UserMessageAttachmentSchema).optional(),
  }),
});

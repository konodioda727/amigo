import { z } from "zod";
import { WorkflowModeSchema } from "../../workflow";
import { UserMessageAttachmentSchema } from "./message";
import { ResolvedModelConfigSnapshotSchema } from "./modelConfigSnapshot";

export const CreateTaskSchema = z.object({
  type: z.literal("createTask"),
  data: z.object({
    message: z.string(),
    attachments: z.array(UserMessageAttachmentSchema).optional(),
    context: z.any().optional(),
    modelConfigSnapshot: ResolvedModelConfigSnapshotSchema.optional(),
    workflowMode: WorkflowModeSchema.optional(),
  }),
});

import { z } from "zod";
import { ResolvedModelConfigSnapshotSchema } from "./modelConfigSnapshot";

export const ResumeSchema = z.object({
  type: z.literal("resume"),
  data: z.object({
    taskId: z.string(),
    modelConfigSnapshot: ResolvedModelConfigSnapshotSchema.optional(),
  }),
});

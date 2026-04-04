import { z } from "zod";

export const ResolvedModelConfigSnapshotSchema = z.object({
  configId: z.string().min(1),
  model: z.string().min(1),
  provider: z.string().min(1).optional(),
});

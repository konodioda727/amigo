import { z } from "zod";

export const ResolvedModelConfigSnapshotSchema = z.object({
  configId: z.string().min(1),
  model: z.string().min(1),
  provider: z.string().min(1),
  apiKey: z.string().min(1),
  baseURL: z.string().min(1).optional(),
  contextWindow: z.number().int().positive().optional(),
  thinkType: z.string().min(1).optional(),
  compressionThreshold: z.number().positive().max(1).optional(),
  targetRatio: z.number().positive().max(1).optional(),
  preserveRecentMessages: z.number().int().positive().optional(),
  minMessagesToCompress: z.number().int().positive().optional(),
});

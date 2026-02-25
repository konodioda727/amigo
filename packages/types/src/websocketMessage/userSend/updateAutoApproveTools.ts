import { z } from "zod";

export const UpdateAutoApproveToolsSchema = z.object({
  type: z.literal("updateAutoApproveTools"),
  data: z.object({
    taskId: z.string(),
    toolNames: z.array(z.string()),
  }),
});

export type UpdateAutoApproveToolsMessage = z.infer<typeof UpdateAutoApproveToolsSchema>;

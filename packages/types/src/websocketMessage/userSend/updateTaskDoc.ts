import { z } from "zod";

export const UpdateTaskDocSchema = z.object({
  type: z.literal("updateTaskDoc"),
  data: z.object({
    taskId: z.string(),
    phase: z.enum(["requirements", "design", "taskList"]),
    content: z.string(),
  }),
});

export type UpdateTaskDocMessage = z.infer<typeof UpdateTaskDocSchema>;

import { z } from "zod";

export const TaskCreatedMessageSchema = z.object({
  type: z.literal("taskCreated"),
  data: z.object({
    taskId: z.string(),
  }),
});

export type TaskCreatedMessageData = z.infer<typeof TaskCreatedMessageSchema>["data"];

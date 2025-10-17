import { z } from "zod";

export const CompletionResultMessageSchema = z.object({
	type: z.literal("completionResult"),
	data: z.object({
		message: z.string(),
	}),
});

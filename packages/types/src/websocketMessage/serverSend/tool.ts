import { z } from "zod";

export const ToolMessageSchema = z.object({
	type: z.literal("tool"),
	data: z.object({
		name: z.string(),
		params: z.object(),
	}),
});

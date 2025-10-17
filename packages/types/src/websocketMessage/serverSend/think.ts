import { z } from "zod";

export const ThinkMessageSchema = z.object({
	type: z.literal("think"),
	data: z.object({
		message: z.string(),
	}),
});

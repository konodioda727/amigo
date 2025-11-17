import { z } from "zod";
import { MessageSchema as SocketMessageSchema } from "./message";
import { IntertuptSchema } from "./interrupt";
import { LoadTaskSchema } from "./loadTask";
import { LoadSubTaskSchema } from "./loadSubTask";
import { ResumeSchema } from "./resume";

export const UserSendMessageSchema = z.discriminatedUnion("type", [
	SocketMessageSchema,
	IntertuptSchema,
	LoadTaskSchema,
	LoadSubTaskSchema,
	ResumeSchema,
]);

/**
 * 用户传入消息种类
 */
export type UserSendWebSocketMessage = z.infer<typeof UserSendMessageSchema>;

/**
 * 用户传入消息类型
 * */
export type USER_SEND_MESSAGE_NAME = UserSendWebSocketMessage["type"];

/**
 * 对应参数要求
 */
export type UserSendMessageData<T extends USER_SEND_MESSAGE_NAME> = Extract<
	UserSendWebSocketMessage,
	{ type: T }
>["data"];

const UserSendMessageTypeSchema = z.union(
	UserSendMessageSchema.options.map((opt) => opt.shape.type),
);

/**
 * 用户发送websocket 消息类型
 */
const UserSendWebSocketSchema = z.object({
	message: z.string(),
	type: UserSendMessageTypeSchema,
});

export type UserSendWebsocketMessageType = z.infer<
	typeof UserSendWebSocketSchema
>;

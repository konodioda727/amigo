import { z } from "zod";
import { CommonMessageSchema } from "./common";
import { ConnectedSchema } from "./connected";
import { ToolMessageSchema } from "./tool";
import { CompletionResultMessageSchema } from "./completionResult";
import { ThinkMessageSchema } from './think';
import { AckMessageSchema } from './ack';
import { TaskHistoryMessageSchema } from './taskHistory';
import { SessionHistoriesMessageSchema } from './sessionHistories';
import { AskFollowupQuestionSchema } from "./askFollowupQuestion";
import { AssignTaskUpdatedMessageSchema } from "./assignTaskUpdated";
import { InterruptMessageSchema } from "./interrupt";
import { ConversationOverSchema } from "./conversationOver";
import { AlertMessageSchema } from "./alert";

export const ErrorMessageSchema = z.object({
	type: z.literal("error"),
	data: z.object({
		message: z.string(),
		details: z.string().optional(),
	}),
});

/**
 * 基础消息 Schema 数组（用于 SDK 扩展）
 */
export const BASE_SERVER_MESSAGE_SCHEMAS = [
	CommonMessageSchema,
	ConnectedSchema,
	ToolMessageSchema,
	CompletionResultMessageSchema,
	ThinkMessageSchema,
	AckMessageSchema,
	TaskHistoryMessageSchema,
	SessionHistoriesMessageSchema,
	AskFollowupQuestionSchema,
	AssignTaskUpdatedMessageSchema,
	InterruptMessageSchema,
	ConversationOverSchema,
	ErrorMessageSchema,
	AlertMessageSchema,
] as const;

export const ServerSendMessageSchema = z.discriminatedUnion(
	"type",
	BASE_SERVER_MESSAGE_SCHEMAS,
);


/**
 * 用户传入消息种类
 */
export type ServerSendWebSocketMessage = z.infer<
	typeof ServerSendMessageSchema
>;

/**
 * 服务传出消息类型
 * */
export type SERVER_SEND_MESSAGE_NAME = ServerSendWebSocketMessage["type"];

/**
 * 对应参数要求
 */
export type ServerSendMessageData<T extends SERVER_SEND_MESSAGE_NAME> = Extract<
	ServerSendWebSocketMessage,
	{ type: T }
>["data"];

const ServerSendMessageTypeSchema = z.union(
	ServerSendMessageSchema.options.map((opt) => opt.shape.type),
);

/**
 * 用户发送websocket 消息类型
 */
const ServerSendWebSocketSchema = z.object({
	message: z.string(),
	type: ServerSendMessageTypeSchema,
});

export type ServerSendWebsocketMessageType = z.infer<
	typeof ServerSendWebSocketSchema
>;

export * from "./error";

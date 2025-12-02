import { z, type ZodObject } from "zod";

/**
 * 消息 Schema 接口（兼容现有 ServerSendMessageSchema 结构）
 * 用户定义的消息必须符合 { type: z.literal("xxx"), data: z.object({...}) } 格式
 */
export type MessageSchema<
  TType extends string = string,
  TData extends ZodObject<any> = ZodObject<any>,
> = z.ZodObject<{
  type: z.ZodLiteral<TType>;
  data: TData;
}>;

/**
 * 消息定义接口
 */
export interface MessageDefinition<
  TType extends string = string,
  TData extends ZodObject<any> = ZodObject<any>,
> {
  /** 消息类型名称 */
  type: TType;
  /** 完整的 Zod Schema */
  schema: MessageSchema<TType, TData>;
  /** 可选的消息处理器（用于服务端接收消息时的处理） */
  handler?: (data: z.infer<TData>) => void | Promise<void>;
}

/**
 * 定义消息的辅助函数（兼容现有 Zod Schema 结构）
 *
 * 生成符合 { type: z.literal("xxx"), data: z.object({...}) } 格式的消息定义
 */
export function defineMessage<TType extends string, TData extends ZodObject<any>>(definition: {
  type: TType;
  dataSchema: TData;
  handler?: (data: z.infer<TData>) => void | Promise<void>;
}): MessageDefinition<TType, TData> {
  return {
    type: definition.type,
    schema: z.object({
      type: z.literal(definition.type),
      data: definition.dataSchema,
    }) as MessageSchema<TType, TData>,
    handler: definition.handler,
  };
}

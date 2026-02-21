import type { MessageDefinition, ToolInterface } from "@amigo-llm/types";

/**
 * GlobalState 类型
 */
export interface GlobalStateType {
  globalStoragePath: string;
  /** 用户通过 SDK 注册的自定义工具 */
  // biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
  registryTools: ToolInterface<any>[];
  /** 用户通过 SDK 注册的自定义消息定义 */
  registryMessages: MessageDefinition[];
}

/**
 * GlobalState 键值
 */
export type GlobalStateKeys = keyof GlobalStateType;

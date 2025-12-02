import type { MessageDefinition, ToolInterface, ToolNames } from "@amigo/types";
import type { ConversationManager } from "../core/conversationManager";

/**
 * GlobalState 类型
 */
export interface GlobalStateType {
  globalStoragePath: string;
  conversationManagerMapping: Record<string, ConversationManager>;
  /** 用户通过 SDK 注册的自定义工具 */
  registryTools: ToolInterface<ToolNames>[];
  /** 用户通过 SDK 注册的自定义消息定义 */
  registryMessages: MessageDefinition[];
}
/**
 * GlobalState 键值
 */
export type GlobalStateKeys = keyof GlobalStateType;

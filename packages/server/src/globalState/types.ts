import type { ConversationManager } from "../core/conversationManager";

/**
 * GlobalState 类型
 */
export interface GlobalStateType {
  globalStoragePath: string;
  conversationManagerMapping: Record<string, ConversationManager>;
}
/**
 * GlobalState 键值
 */
export type GlobalStateKeys = keyof GlobalStateType;

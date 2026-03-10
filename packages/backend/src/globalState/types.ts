import type { MessageDefinition, ToolInterface } from "@amigo-llm/types";
import type { ModelContextConfig } from "@/core/model/contextConfig";
import type { SandboxManager } from "@/core/sandbox/types";

export type ConversationTypeKey = "main" | "sub";

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
  /** 额外自动批准的工具名称（在内置默认列表之外） */
  autoApproveToolNames: string[];
  /** 使用 SDK 覆盖默认自动批准工具名称 */
  defaultAutoApproveToolNames?: string[];
  /** 通过 SDK 配置的全局追加系统提示词（用于 agent 特化） */
  extraSystemPrompt: string;
  /** 使用 SDK 覆盖基础工具集合 */
  // biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
  baseTools?: Partial<Record<ConversationTypeKey, ToolInterface<any>[]>>;
  /** 使用 SDK 覆盖默认 system prompt */
  systemPrompts?: Partial<Record<ConversationTypeKey, string>>;
  /** 可注入的 sandbox manager */
  sandboxManager?: SandboxManager;
  /** 按模型配置上下文窗口与压缩阈值 */
  modelContextConfigs?: Record<string, ModelContextConfig | number>;
  /** 会话创建完成后的 app 层 hook */
  onConversationCreate?: (payload: { taskId: string; context?: any }) => void | Promise<void>;
}

/**
 * GlobalState 键值
 */
export type GlobalStateKeys = keyof GlobalStateType;

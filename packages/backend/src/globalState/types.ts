import type { ChatMessage, MessageDefinition, ToolInterface } from "@amigo-llm/types";
import type { ModelConfig, ModelContextConfig } from "@/core/model/contextConfig";
import type { ConversationPersistenceProvider } from "@/core/persistence/types";
import type { SandboxManager } from "@/core/sandbox/types";
import type { CreateTaskConfigResolver } from "@/core/server";

export type ConversationTypeKey = "main" | "sub";

/**
 * GlobalState 类型
 */
export interface GlobalStateType {
  globalStoragePath: string;
  globalCachePath: string;
  /** 用户通过 SDK 注册的自定义工具 */
  registryTools: ToolInterface<unknown>[];
  /** 用户通过 SDK 注册的自定义消息定义 */
  registryMessages: MessageDefinition[];
  /** 额外自动批准的工具名称（在内置默认列表之外） */
  autoApproveToolNames: string[];
  /** 使用 SDK 覆盖默认自动批准工具名称 */
  defaultAutoApproveToolNames?: string[];
  /** 通过 SDK 配置的全局追加系统提示词（用于 agent 特化） */
  extraSystemPrompt: string;
  /** 使用 SDK 覆盖基础工具集合 */
  baseTools?: Partial<Record<ConversationTypeKey, ToolInterface<unknown>[]>>;
  /** 使用 SDK 覆盖默认 system prompt */
  systemPrompts?: Partial<Record<ConversationTypeKey, string>>;
  /** 可注入的 sandbox manager */
  sandboxManager?: SandboxManager;
  /** 可注入的会话 persistence provider */
  conversationPersistenceProvider?: ConversationPersistenceProvider;
  /** 按模型配置 provider、baseURL、上下文窗口与压缩参数 */
  modelConfigs?: Record<string, ModelConfig | number>;
  /** 兼容旧命名，后续建议使用 modelConfigs */
  modelContextConfigs?: Record<string, ModelContextConfig | number>;
  /** 会话创建完成后的 app 层 hook */
  onConversationCreate?: (payload: { taskId: string; context?: unknown }) => void | Promise<void>;
  /** 会话消息产生后的 app 层 hook */
  onConversationMessage?: (payload: {
    taskId: string;
    message: ChatMessage;
    context?: unknown;
  }) => void | Promise<void>;
  /** 在 createTask 真正创建会话前解析任务配置 */
  createTaskConfigResolver?: CreateTaskConfigResolver;
}

/**
 * GlobalState 键值
 */
export type GlobalStateKeys = keyof GlobalStateType;

/**
 * 服务器构建器 API
 *
 * 用于配置 Amigo 服务器实例的流式构建器
 */

import type { ChatMessage, MessageDefinition, ToolInterface } from "@amigo-llm/types";
import type { ZodObject, ZodRawShape } from "zod";
import type { LoggerConfig } from "@/utils/logger";
import { type ServerConfig, ServerConfigSchema } from "../config";
import type { LlmFactory } from "../model";
import type {
  ModelConfig,
  ModelContextConfig,
  ModelSelection,
  ResolvedModelConfig,
} from "../model/contextConfig";
import type { ConversationPersistenceProvider } from "../persistence/types";
import { MessageRegistry, ToolRegistry } from "../registry";
import type { SandboxManager } from "../sandbox";
import type { ConversationMessageHookPayload, CreateTaskConfigResolver } from "../server";
import AmigoServer from "../server";
import {
  createReadSkillBundleTool,
  READ_SKILL_BUNDLE_TOOL_NAME,
  type SkillProvider,
  SkillRuntime,
} from "../skills";

/**
 * Amigo 服务器流式构建器
 *
 * @example
 * ```typescript
 * import { AmigoServerBuilder } from "@amigo-llm/backend";
 *
 * const server = new AmigoServerBuilder()
 *   .port(8080)
 *   .cachePath("./.amigo")
 *   .registerTool(myTool)
 *   .build();
 *
 * server.init();
 * ```
 */
export class AmigoServerBuilder {
  private config: Partial<ServerConfig> = {};
  private _toolRegistry = new ToolRegistry();
  private _messageRegistry = new MessageRegistry();
  private _llmFactory?: LlmFactory;
  private _autoApproveToolNames = new Set<string>();
  private _defaultAutoApproveToolNames?: string[];
  private _extraSystemPrompt = "";
  private _baseTools: Partial<Record<"main" | "sub", ToolInterface<unknown>[]>> = {};
  private _systemPrompts: Partial<Record<"main" | "sub", string>> = {};
  private _sandboxManager?: SandboxManager;
  private _conversationPersistenceProvider?: ConversationPersistenceProvider;
  private _modelConfigs?: Record<string, ModelConfig>;
  private _loggerConfig?: Partial<LoggerConfig>;
  private _onConversationCreate?: (payload: {
    taskId: string;
    context?: unknown;
  }) => void | Promise<void>;
  private _onConversationMessage?: (
    payload: ConversationMessageHookPayload,
  ) => void | Promise<void>;
  private _createTaskConfigResolver?: CreateTaskConfigResolver;
  private _skillProvider?: SkillProvider;
  private _userModelConfigResolver?: (payload: {
    userId?: string;
    selection: string | ModelSelection;
  }) => ResolvedModelConfig | null;

  /**
   * 设置服务器端口
   */
  port(port: number): this {
    this.config.port = port;
    return this;
  }

  /**
   * 设置内部缓存根目录（pnpm-store / github-bootstrap 等）
   */
  cachePath(path: string): this {
    this.config.cachePath = path;
    return this;
  }

  /**
   * 注册工具
   */
  registerTool<T extends ToolInterface<string>>(tool: T): this {
    this._toolRegistry.register(tool);
    return this;
  }

  /**
   * 注册自定义消息类型
   *
   * 运行时收到未匹配内置消息 schema 的消息时，会尝试匹配这里注册的 schema，
   * 校验通过后调用 message.handler。
   * 内置消息（createTask / userSendMessage 等）仍由内置 resolver 处理。
   */
  registerMessage<TType extends string, TData extends ZodObject<ZodRawShape>>(
    message: MessageDefinition<TType, TData>,
  ): this {
    this._messageRegistry.register(message);
    return this;
  }

  /**
   * 注入模型工厂（覆盖默认的环境变量模型创建逻辑）
   */
  llmFactory(factory: LlmFactory): this {
    this._llmFactory = factory;
    return this;
  }

  /**
   * llmFactory 的语义化别名
   */
  modelProvider(factory: LlmFactory): this {
    return this.llmFactory(factory);
  }

  /**
   * 覆盖额外自动批准的工具名称列表（在内置默认列表之外）
   */
  autoApproveTools(toolNames: string[]): this {
    this._autoApproveToolNames = new Set(toolNames.map((name) => name.trim()).filter(Boolean));
    return this;
  }

  /**
   * 追加额外自动批准的工具名称
   */
  addAutoApproveTools(toolNames: string[]): this {
    for (const name of toolNames) {
      const trimmed = name.trim();
      if (trimmed) {
        this._autoApproveToolNames.add(trimmed);
      }
    }
    return this;
  }

  /**
   * 覆盖默认自动批准工具名称列表
   */
  defaultAutoApproveTools(toolNames: string[]): this {
    this._defaultAutoApproveToolNames = toolNames.map((name) => name.trim()).filter(Boolean);
    return this;
  }

  /**
   * 追加全局系统提示词（用于将默认 Agent 特化为 coding agent 等场景）
   */
  appendSystemPrompt(prompt: string): this {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return this;
    }
    this._extraSystemPrompt = this._extraSystemPrompt
      ? `${this._extraSystemPrompt}\n\n${trimmed}`
      : trimmed;
    return this;
  }

  /**
   * appendSystemPrompt 的语义化别名（覆盖式设置）
   */
  extraSystemPrompt(prompt: string): this {
    this._extraSystemPrompt = prompt.trim();
    return this;
  }

  baseTools(tools: Partial<Record<"main" | "sub", ToolInterface<unknown>[]>>): this {
    if (tools.main) {
      this._baseTools.main = [...tools.main];
    }
    if (tools.sub) {
      this._baseTools.sub = [...tools.sub];
    }
    return this;
  }

  mainBaseTools(tools: ToolInterface<unknown>[]): this {
    return this.baseTools({ main: tools });
  }

  subBaseTools(tools: ToolInterface<unknown>[]): this {
    return this.baseTools({ sub: tools });
  }

  systemPrompts(prompts: Partial<Record<"main" | "sub", string>>): this {
    if (typeof prompts.main === "string") {
      this._systemPrompts.main = prompts.main.trim();
    }
    if (typeof prompts.sub === "string") {
      this._systemPrompts.sub = prompts.sub.trim();
    }
    return this;
  }

  mainSystemPrompt(prompt: string): this {
    return this.systemPrompts({ main: prompt });
  }

  subSystemPrompt(prompt: string): this {
    return this.systemPrompts({ sub: prompt });
  }

  sandboxManager(manager: SandboxManager): this {
    this._sandboxManager = manager;
    return this;
  }

  conversationPersistenceProvider(provider: ConversationPersistenceProvider): this {
    this._conversationPersistenceProvider = provider;
    return this;
  }

  modelConfigs(configs: Record<string, ModelConfig>): this {
    this._modelConfigs = { ...configs };
    return this;
  }

  modelContextConfigs(configs: Record<string, ModelContextConfig>): this {
    this._modelConfigs = { ...configs };
    return this;
  }

  loggerConfig(config: Partial<LoggerConfig>): this {
    this._loggerConfig = { ...this._loggerConfig, ...config };
    return this;
  }

  onConversationCreate(
    hook: (payload: { taskId: string; context?: unknown }) => void | Promise<void>,
  ): this {
    this._onConversationCreate = hook;
    return this;
  }

  onConversationMessage(
    hook: (payload: {
      taskId: string;
      message: ChatMessage;
      context?: unknown;
    }) => void | Promise<void>,
  ): this {
    this._onConversationMessage = hook;
    return this;
  }

  resolveCreateTaskConfig(resolver: CreateTaskConfigResolver): this {
    this._createTaskConfigResolver = resolver;
    return this;
  }

  userModelConfigResolver(
    resolver: (payload: {
      userId?: string;
      selection: string | ModelSelection;
    }) => ResolvedModelConfig | null,
  ): this {
    this._userModelConfigResolver = resolver;
    return this;
  }

  skills(options: { provider: SkillProvider }): this {
    this._skillProvider = options.provider;
    if (!this._toolRegistry.has(READ_SKILL_BUNDLE_TOOL_NAME)) {
      this._toolRegistry.register(createReadSkillBundleTool(options.provider));
    }
    return this;
  }

  /**
   * 获取工具注册表（用于检查）
   */
  get toolRegistry(): ToolRegistry {
    return this._toolRegistry;
  }

  /**
   * 获取消息注册表（用于检查）
   */
  get messageRegistry(): MessageRegistry {
    return this._messageRegistry;
  }

  /**
   * 构建并返回配置好的服务器实例
   * @returns 配置好的 AmigoServer 实例
   */
  build(): AmigoServer {
    const validatedConfig = ServerConfigSchema.parse(this.config);
    if (!this._conversationPersistenceProvider) {
      throw new Error(
        "AmigoServerBuilder requires a conversationPersistenceProvider. The backend SDK no longer falls back to file storage.",
      );
    }
    const skillRuntime = this._skillProvider ? new SkillRuntime(this._skillProvider) : undefined;
    const createTaskConfigResolver =
      skillRuntime || this._createTaskConfigResolver
        ? async (payload: Parameters<CreateTaskConfigResolver>[0]) => {
            const baseConfig = this._createTaskConfigResolver
              ? await this._createTaskConfigResolver(payload)
              : undefined;
            const skillConfig = skillRuntime
              ? await skillRuntime.resolveCreateTaskConfig(payload.context)
              : undefined;
            return mergeCreateTaskConfigs(baseConfig, skillConfig);
          }
        : undefined;
    const onConversationCreate =
      skillRuntime || this._onConversationCreate
        ? async (payload: { taskId: string; context?: unknown }) => {
            if (this._onConversationCreate) {
              await this._onConversationCreate(payload);
            }
            if (skillRuntime) {
              await skillRuntime.onConversationCreate(payload);
            }
          }
        : undefined;
    return new AmigoServer({
      config: validatedConfig,
      toolRegistry: this._toolRegistry,
      messageRegistry: this._messageRegistry,
      llmFactory: this._llmFactory,
      autoApproveToolNames: Array.from(this._autoApproveToolNames),
      defaultAutoApproveToolNames: this._defaultAutoApproveToolNames,
      extraSystemPrompt: this._extraSystemPrompt,
      baseTools: this._baseTools,
      systemPrompts: this._systemPrompts,
      sandboxManager: this._sandboxManager,
      conversationPersistenceProvider: this._conversationPersistenceProvider,
      modelConfigs: this._modelConfigs,
      loggerConfig: this._loggerConfig,
      onConversationCreate,
      onConversationMessage: this._onConversationMessage,
      createTaskConfigResolver,
      userModelConfigResolver: this._userModelConfigResolver,
    });
  }
}

const mergeStringLists = (
  left: string[] | undefined,
  right: string[] | undefined,
): string[] | undefined => {
  if (!left && !right) {
    return undefined;
  }
  return Array.from(new Set([...(left || []), ...(right || [])]));
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const mergeCreateTaskConfigs = (
  baseConfig: Awaited<ReturnType<CreateTaskConfigResolver>> | undefined,
  skillConfig: Awaited<ReturnType<CreateTaskConfigResolver>> | undefined,
) => {
  if (!baseConfig) {
    return skillConfig;
  }
  if (!skillConfig) {
    return baseConfig;
  }

  const mergedCustomPrompt = [baseConfig.customPrompt, skillConfig.customPrompt]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join("\n\n");
  const mergedToolNames = mergeStringLists(baseConfig.toolNames, skillConfig.toolNames);
  const mergedAutoApproveToolNames = mergeStringLists(
    baseConfig.autoApproveToolNames,
    skillConfig.autoApproveToolNames,
  );
  const mergedContext =
    isPlainObject(baseConfig.context) && isPlainObject(skillConfig.context)
      ? { ...baseConfig.context, ...skillConfig.context }
      : (skillConfig.context ?? baseConfig.context);

  return {
    ...(mergedCustomPrompt ? { customPrompt: mergedCustomPrompt } : {}),
    ...(mergedToolNames ? { toolNames: mergedToolNames } : {}),
    ...(mergedAutoApproveToolNames ? { autoApproveToolNames: mergedAutoApproveToolNames } : {}),
    ...(mergedContext !== undefined ? { context: mergedContext } : {}),
  };
};

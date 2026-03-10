/**
 * 服务器构建器 API
 *
 * 用于配置 Amigo 服务器实例的流式构建器
 */

import type { MessageDefinition, ToolInterface } from "@amigo-llm/types";
import type { ZodObject } from "zod";
import type { LoggerConfig } from "@/utils/logger";
import { type ServerConfig, ServerConfigSchema } from "../config";
import type { LlmFactory } from "../model";
import type { ModelConfig, ModelContextConfig } from "../model/contextConfig";
import { MessageRegistry, ToolRegistry } from "../registry";
import type { SandboxManager } from "../sandbox";
import AmigoServer from "../server";

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
  // biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
  private _baseTools: Partial<Record<"main" | "sub", ToolInterface<any>[]>> = {};
  private _systemPrompts: Partial<Record<"main" | "sub", string>> = {};
  private _sandboxManager?: SandboxManager;
  private _modelConfigs?: Record<string, ModelConfig | number>;
  private _loggerConfig?: Partial<LoggerConfig>;
  private _onConversationCreate?: (payload: {
    taskId: string;
    context?: any;
  }) => void | Promise<void>;

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
  registerTool<T extends ToolInterface<any>>(tool: T): this {
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
  registerMessage<TType extends string, TData extends ZodObject<any>>(
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

  // biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
  baseTools(tools: Partial<Record<"main" | "sub", ToolInterface<any>[]>>): this {
    if (tools.main) {
      this._baseTools.main = [...tools.main];
    }
    if (tools.sub) {
      this._baseTools.sub = [...tools.sub];
    }
    return this;
  }

  // biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
  mainBaseTools(tools: ToolInterface<any>[]): this {
    return this.baseTools({ main: tools });
  }

  // biome-ignore lint/suspicious/noExplicitAny: 用于工具集合
  subBaseTools(tools: ToolInterface<any>[]): this {
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

  modelConfigs(configs: Record<string, ModelConfig | number>): this {
    this._modelConfigs = { ...configs };
    return this;
  }

  modelContextConfigs(configs: Record<string, ModelContextConfig | number>): this {
    this._modelConfigs = { ...configs };
    return this;
  }

  loggerConfig(config: Partial<LoggerConfig>): this {
    this._loggerConfig = { ...this._loggerConfig, ...config };
    return this;
  }

  onConversationCreate(
    hook: (payload: { taskId: string; context?: any }) => void | Promise<void>,
  ): this {
    this._onConversationCreate = hook;
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
      modelConfigs: this._modelConfigs,
      loggerConfig: this._loggerConfig,
      onConversationCreate: this._onConversationCreate,
    });
  }
}

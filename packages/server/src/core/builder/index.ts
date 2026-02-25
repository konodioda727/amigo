/**
 * 服务器构建器 API
 *
 * 用于配置 Amigo 服务器实例的流式构建器
 */

import type { MessageDefinition, ToolInterface } from "@amigo-llm/types";
import type { ZodObject } from "zod";
import { type ServerConfig, ServerConfigSchema } from "../config";
import type { LlmFactory } from "../model";
import { MessageRegistry, ToolRegistry } from "../registry";
import AmigoServer from "../server";

/**
 * Amigo 服务器流式构建器
 *
 * @example
 * ```typescript
 * import { AmigoServerBuilder } from "@amigo-llm/server";
 *
 * const server = new AmigoServerBuilder()
 *   .port(8080)
 *   .storagePath("./my-storage")
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
  private _extraSystemPrompt = "";

  /**
   * 设置服务器端口
   */
  port(port: number): this {
    this.config.port = port;
    return this;
  }

  /**
   * 设置会话持久化存储路径
   */
  storagePath(path: string): this {
    this.config.storagePath = path;
    return this;
  }

  /**
   * 注册工具
   */
  registerTool<K extends string>(tool: ToolInterface<K>): this {
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
      extraSystemPrompt: this._extraSystemPrompt,
    });
  }
}

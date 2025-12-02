/**
 * 服务器构建器 API
 *
 * 用于配置 Amigo 服务器实例的流式构建器
 */

import type { ToolInterface, ToolNames } from "@amigo/types";
import { ServerConfigSchema, type ServerConfig } from "../config";
import { ToolRegistry, MessageRegistry } from "../registry";

/**
 * Amigo 服务器流式构建器
 *
 * @example
 * ```typescript
 * import { AmigoServerBuilder } from "@amigo/server";
 *
 * const { config, toolRegistry, messageRegistry } = new AmigoServerBuilder()
 *   .port(8080)
 *   .storagePath("./my-storage")
 *   .registerTool(myTool)
 *   .build();
 * ```
 */
export class AmigoServerBuilder {
  private config: Partial<ServerConfig> = {};
  private _toolRegistry = new ToolRegistry();
  private _messageRegistry = new MessageRegistry();

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
  registerTool(tool: ToolInterface<ToolNames>): this {
    this._toolRegistry.register(tool);
    return this;
  }

  /**
   * 注册自定义消息类型
   */
  registerMessage(message: { type: string; schema: unknown }): this {
    this._messageRegistry.register(message);
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
   * 构建服务器配置
   * @returns 验证后的服务器配置和注册表
   */
  build(): {
    config: ServerConfig;
    toolRegistry: ToolRegistry;
    messageRegistry: MessageRegistry;
  } {
    const validatedConfig = ServerConfigSchema.parse(this.config);
    return {
      config: validatedConfig,
      toolRegistry: this._toolRegistry,
      messageRegistry: this._messageRegistry,
    };
  }
}

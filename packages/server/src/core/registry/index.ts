/**
 * 工具和消息注册表
 *
 * 用于动态管理工具和消息的注册表类
 */

import type { MessageDefinition, ToolInterface, ToolNames } from "@amigo-llm/types";
import type { ZodObject } from "zod";

/**
 * 注册重复时抛出的错误
 */
export class RegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistrationError";
  }
}

/**
 * 工具注册表
 */
export class ToolRegistry {
  private tools: Map<string, ToolInterface<ToolNames>> = new Map();

  /**
   * 注册工具
   * @throws {RegistrationError} 如果同名工具已存在
   */
  register(tool: ToolInterface<ToolNames>): void {
    if (this.tools.has(tool.name)) {
      throw new RegistrationError(`工具 "${tool.name}" 已被注册`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * 根据名称获取工具
   */
  get(name: string): ToolInterface<ToolNames> | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有已注册的工具
   */
  getAll(): ToolInterface<ToolNames>[] {
    return Array.from(this.tools.values());
  }

  /**
   * 检查工具是否已注册
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取已注册工具的数量
   */
  get size(): number {
    return this.tools.size;
  }
}

/**
 * 消息注册表
 */
export class MessageRegistry {
  private messages: Map<string, MessageDefinition> = new Map();

  /**
   * 注册消息类型
   * @throws {RegistrationError} 如果同类型消息已存在
   */
  register<TType extends string, TData extends ZodObject<any>>(
    message: MessageDefinition<TType, TData>,
  ): void {
    if (this.messages.has(message.type)) {
      throw new RegistrationError(`消息类型 "${message.type}" 已被注册`);
    }
    this.messages.set(message.type, message);
  }

  /**
   * 根据类型获取消息定义
   */
  get(type: string): MessageDefinition | undefined {
    return this.messages.get(type);
  }

  /**
   * 获取所有已注册的消息定义
   */
  getAll(): MessageDefinition[] {
    return Array.from(this.messages.values());
  }

  /**
   * 获取所有消息的 Schema（用于合并到 discriminatedUnion）
   */
  getAllSchemas(): MessageDefinition["schema"][] {
    return this.getAll().map((msg) => msg.schema);
  }

  /**
   * 检查消息类型是否已注册
   */
  has(type: string): boolean {
    return this.messages.has(type);
  }

  /**
   * 获取已注册消息类型的数量
   */
  get size(): number {
    return this.messages.size;
  }
}

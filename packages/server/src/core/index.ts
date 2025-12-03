/**
 * 核心模块导出
 *
 * Amigo 服务器核心功能的公共 API
 */

export type { MessageDefinition, MessageSchema } from "@amigo-llm/types";
// 从 @amigo-llm/types 重新导出消息定义相关类型
export { defineMessage } from "@amigo-llm/types";
// 构建器 API
export { AmigoServerBuilder } from "./builder";
export type { ServerConfig } from "./config";
// 服务器配置
export { ServerConfigSchema, ValidationError } from "./config";
// 注册表
export { MessageRegistry, RegistrationError, ToolRegistry } from "./registry";
// 服务器
export { type AmigoServerOptions, default as AmigoServer } from "./server";

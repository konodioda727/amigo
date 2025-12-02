/**
 * 核心模块导出
 *
 * Amigo 服务器核心功能的公共 API
 */

// 服务器配置
export { ServerConfigSchema, ValidationError } from "./config";
export type { ServerConfig } from "./config";

// 注册表
export { MessageRegistry, RegistrationError, ToolRegistry } from "./registry";

// 构建器 API
export { AmigoServerBuilder } from "./builder";

// 服务器
export { default as AmigoServer, type AmigoServerOptions } from "./server";

// 从 @amigo/types 重新导出消息定义相关类型
export { defineMessage } from "@amigo/types";
export type { MessageDefinition, MessageSchema } from "@amigo/types";

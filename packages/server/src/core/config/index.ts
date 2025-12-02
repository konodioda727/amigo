/**
 * 服务器配置
 *
 * Amigo 服务器的配置 Schema 和类型定义
 */

import { z } from "zod";

/**
 * 服务器配置 Schema（带验证）
 */
export const ServerConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(10013),
  storagePath: z.string().default("./storage"),
  maxConnections: z.number().int().positive().optional(),
  heartbeatInterval: z.number().int().positive().optional(),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

/**
 * 验证失败时抛出的错误
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly details: z.ZodError
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

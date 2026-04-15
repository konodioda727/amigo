/**
 * SDK Type Definitions
 *
 * SDK-specific types for server configuration.
 * Tool and Message types are imported from @amigo-llm/types package.
 */

import path from "node:path";
import type { ToolCompletionBehavior, ToolExecutionMode } from "@amigo-llm/types";
import { z } from "zod";

// Re-export existing types from @amigo-llm/types package for convenience
export type { ToolInterface, ToolParamDefinition } from "@amigo-llm/types";
export type {
  AmigoLlm,
  KnownModelProvider,
  LlmFactory,
  ModelProvider,
} from "../../core/model";

// ============================================================================
// Server Configuration (SDK-specific)
// ============================================================================

/**
 * Server configuration schema with validation
 */
export const ServerConfigSchema = z
  .object({
    port: z.number().int().min(1).max(65535).default(10013),
    cachePath: z.string().default("./.amigo"),
    maxConnections: z.number().int().positive().optional(),
    heartbeatInterval: z.number().int().positive().optional(),
  })
  .transform((config) => ({
    ...config,
    cachePath: path.resolve(config.cachePath),
    storagePath: path.resolve(config.cachePath, "storage"),
  }));

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

// ============================================================================
// Custom Tool Definition (for SDK users to define new tools)
// ============================================================================

/**
 * Custom tool interface for SDK users.
 * This is a simplified version that doesn't require pre-registration in ToolNames.
 */
export interface CustomToolDefinition {
  name: string;
  description: string;
  whenToUse?: string;
  completionBehavior?: ToolCompletionBehavior;
  executionMode?: ToolExecutionMode;
  params: CustomToolParam[];
  invoke: (context: CustomToolInvokeContext) => Promise<{
    message: string;
    toolResult: unknown;
    websocketData?: unknown;
    error?: string;
  }>;
}

/**
 * Custom tool parameter definition
 */
export interface CustomToolParam {
  name: string;
  optional: boolean;
  description: string;
  type?: "string" | "array" | "object";
  params?: CustomToolParam[];
}

/**
 * Custom tool invocation context
 */
export interface CustomToolInvokeContext {
  params: Record<string, unknown>;
  getCurrentTask: () => string;
  getToolFromName: (name: string) => CustomToolDefinition | undefined;
  signal?: AbortSignal;
  postMessage?: (msg: string | object) => void;
}

// ============================================================================
// Custom Message Definition (for SDK users to define new message types)
// ============================================================================

/**
 * Custom message definition for SDK users.
 */
export interface CustomMessageDefinition<TType extends string = string> {
  type: TType;
  schema: z.ZodObject<{
    type: z.ZodLiteral<TType>;
    data: z.ZodObject<z.ZodRawShape>;
  }>;
  handler?: (data: unknown) => void | Promise<void>;
}

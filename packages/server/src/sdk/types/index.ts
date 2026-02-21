/**
 * SDK Type Definitions
 *
 * SDK-specific types for server configuration.
 * Tool and Message types are imported from @amigo-llm/types package.
 */

import { z } from "zod";

// Re-export existing types from @amigo-llm/types package for convenience
export type { ToolInterface, ToolParamDefinition } from "@amigo-llm/types";

// ============================================================================
// Server Configuration (SDK-specific)
// ============================================================================

/**
 * Server configuration schema with validation
 */
export const ServerConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(10013),
  storagePath: z.string().default("./storage"),
  maxConnections: z.number().int().positive().optional(),
  heartbeatInterval: z.number().int().positive().optional(),
});

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
  whenToUse: string;
  params: CustomToolParam[];
  useExamples: string[];
  invoke: (context: CustomToolInvokeContext) => Promise<{
    message: string;
    toolResult: unknown;
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

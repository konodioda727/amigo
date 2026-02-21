/**
 * Amigo Server SDK
 *
 * A type-safe SDK for extending the Amigo server with custom tools and messages.
 *
 * @example
 * ```typescript
 * import { AmigoServerBuilder, defineTool, defineMessage } from "@amigo-llm/server/sdk";
 * import { z } from "zod";
 *
 * const server = new AmigoServerBuilder()
 *   .port(8080)
 *   .storagePath("./my-storage")
 *   .registerTool(defineTool({
 *     name: "my_tool",
 *     description: "My custom tool",
 *     whenToUse: "When needed",
 *     params: [{ name: "input", optional: false, description: "Input text" }],
 *     useExamples: ["<my_tool><input>test</input></my_tool>"],
 *     invoke: async ({ params }) => ({
 *       message: "Done",
 *       toolResult: params.input,
 *     }),
 *   }))
 *   .registerMessage(defineMessage({
 *     type: "myNotification",
 *     dataSchema: z.object({ text: z.string() }),
 *   }))
 *   .build();
 * ```
 */

// Builder API
export { AmigoServerBuilder } from "../core/builder";
export { ValidationError } from "../core/config";
// Error types
// Registries (advanced usage)
export { MessageRegistry, RegistrationError, ToolRegistry } from "../core/registry";
// Helper functions
export { defineMessage, defineTool } from "./helpers";
// Types (SDK-specific)
// Re-export existing types from @amigo-llm/types for convenience
export type {
  CustomMessageDefinition,
  CustomToolDefinition,
  CustomToolInvokeContext,
  CustomToolParam,
  ServerConfig,
  ToolInterface,
  ToolParamDefinition,
} from "./types";
export { ServerConfigSchema } from "./types";

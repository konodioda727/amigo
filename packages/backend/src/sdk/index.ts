/**
 * Amigo Server SDK
 *
 * A type-safe SDK for extending the Amigo server with custom tools and messages.
 *
 * @example
 * ```typescript
 * import { AmigoServerBuilder, defineTool } from "@amigo-llm/backend/sdk";
 *
 * const server = new AmigoServerBuilder()
 *   .port(8080)
 *   .storagePath("./my-storage")
 *   .appendSystemPrompt("你是一个 coding agent，先搜索定位，再修改，修改后必须验证。")
 *   .registerTool(defineTool({
 *     name: "my_tool",
 *     description: "My custom tool",
 *     params: [{ name: "input", optional: false, description: "Input text" }],
 *     invoke: async ({ params }) => ({
 *       message: "Done",
 *       toolResult: params.input,
 *     }),
 *   }))
 *   .build();
 * ```
 *
 * Note:
 * - `registerTool()` 已接入运行时执行链。
 * - `registerMessage()` 会在运行时对未匹配内置消息的入站消息做 schema 校验，并在校验通过后调用 `handler`。
 * - 内置 WebSocket 消息（如 `createTask`、`userSendMessage`）仍走内置 resolver。
 */

// Builder API
export { AmigoServerBuilder } from "../core/builder";
export { ValidationError } from "../core/config";
export type { ModelContextConfig } from "../core/model/contextConfig";
// Error types
// Registries (advanced usage)
export { MessageRegistry, RegistrationError, ToolRegistry } from "../core/registry";
export type { SandboxManager } from "../core/sandbox";
// Helper functions
export { defineMessage, defineTool } from "./helpers";
// Types (SDK-specific)
// Re-export existing types from @amigo-llm/types for convenience
export type {
  AmigoLlm,
  CustomMessageDefinition,
  CustomToolDefinition,
  CustomToolInvokeContext,
  CustomToolParam,
  LlmFactory,
  ServerConfig,
  ToolInterface,
  ToolParamDefinition,
} from "./types";
export { ServerConfigSchema } from "./types";

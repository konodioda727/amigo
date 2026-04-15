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
 *   .cachePath("./.amigo")
 *   .appendSystemPrompt("你是一个 coding agent，先搜索定位，再修改，修改后必须验证。")
 *   .registerTool(defineTool({
 *     name: "my_tool",
 *     description: "My custom tool",
 *     executionMode: "parallel_readonly",
 *     completionBehavior: "idle",
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
 * - 纯只读且彼此独立的自定义工具可声明 `executionMode: "parallel_readonly"`，运行时会与同轮其他安全只读工具并行执行。
 * - 自定义工具可通过 `completionBehavior: "idle"` 在执行后结束当前回合并等待用户下一次输入。
 * - `registerMessage()` 会在运行时对未匹配内置消息的入站消息做 schema 校验，并在校验通过后调用 `handler`。
 * - 内置 WebSocket 消息（如 `createTask`、`userSendMessage`）仍走内置 resolver。
 */

// Builder API
export { AmigoServerBuilder } from "../core/builder";
export { ValidationError } from "../core/config";
export type {
  LanguageRuntimeHost,
  LanguageRuntimeHostManager,
  LspConfig,
  LspRuntimeContext,
  LspServerDefinition,
  SpawnStdioProcessParams,
  StdioProcess,
  StdioProcessExit,
} from "../core/languageRuntime";
export { createLanguageRuntimeHostManagerFromSandboxManager } from "../core/languageRuntime";
export type {
  InMemoryMemoryIndexProvider,
  LongTermMemoryCandidate,
  MemoryConfig,
  MemoryDocument,
  MemoryEmbeddingProvider,
  MemoryLongTermConfig,
  MemoryNamespace,
  MemoryRetrievalConfig,
  MemoryStore,
  MemoryStoreHit,
  MemoryStoreQuery,
  MemoryStoreRecord,
} from "../core/memoryRuntime";
export {
  createDeterministicMemoryEmbeddingProvider,
  createInMemoryMemoryIndexProvider,
  createInMemoryMemoryStore,
  DeterministicMemoryEmbeddingProvider,
  InMemoryMemoryStore,
} from "../core/memoryRuntime";
export {
  listAvailableModels,
  MODEL_PROVIDERS,
  resolveModelConfig,
  resolveModelConfigFromConfigs,
} from "../core/model";
export type {
  ModelConfig,
  ModelConfigSnapshot,
  ModelContextConfig,
  ModelSelection,
  ModelThinkType,
  ProviderModelConfig,
  ResolvedModelConfig,
} from "../core/model/contextConfig";
// Error types
// Registries (advanced usage)
export { MessageRegistry, RegistrationError, ToolRegistry } from "../core/registry";
export * from "../core/rules";
export type { SandboxManager } from "../core/sandbox";
export type {
  ConversationMessageHookPayload,
  CreateTaskConfig,
  CreateTaskConfigResolver,
} from "../core/server";
export * from "../core/skills";
export type {
  EditFileDiagnosticsProvider,
  EditFileDiagnosticsProviderPayload,
} from "../core/tools/editFileDiagnostics";
export type { LoggerConfig } from "../utils/logger";
export { configureLogger, LogLevel } from "../utils/logger";
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
  KnownModelProvider,
  LlmFactory,
  ModelProvider,
  ServerConfig,
  ToolInterface,
  ToolParamDefinition,
} from "./types";
export { ServerConfigSchema } from "./types";

import type { ChatMessage, ToolInterface, UserMessageAttachment } from "@amigo-llm/types";
import Bun, { type ServerWebSocket } from "bun";
import { setGlobalState } from "@/globalState";
import { configureLogger, type LoggerConfig } from "@/utils/logger";
import type { ServerConfig } from "../config";
import type {
  TaskExecutionCompletionValidationHookPayload,
  TaskExecutionValidationResult,
  TaskExecutionVerificationHookPayload,
  TaskExecutionVerificationResult,
} from "../conversation/execution/taskExecutionPolicyTypes";
import type { LanguageRuntimeHostManager, LspConfig } from "../languageRuntime";
import { type MemoryConfig, SdkMemoryRuntime } from "../memoryRuntime";
import { type LlmFactory, setLlmFactory } from "../model";
import type {
  ModelConfig,
  ModelContextConfig,
  ModelSelection,
  ResolvedModelConfig,
} from "../model/contextConfig";
import type { ConversationPersistenceProvider } from "../persistence/types";
import type { MessageRegistry, ToolRegistry } from "../registry";
import type { RuleProvider } from "../rules";
import type { SandboxManager } from "../sandbox";
import type { EditFileDiagnosticsProvider } from "../tools/editFileDiagnostics";
import type { WorkflowPromptScope } from "../workflow";
import { ServerWebSocketMessageHandler } from "./webSocketMessageHandler";

export interface ConversationWebSocketData {
  kind: "conversation";
  userId?: string;
}

type AmigoWebSocketData = ConversationWebSocketData | undefined;

export interface CreateTaskConfig {
  customPrompt?: string;
  toolNames?: string[];
  autoApproveToolNames?: string[];
  context?: unknown;
}

export type CreateTaskConfigResolver = (payload: {
  taskId: string;
  message: string;
  attachments?: UserMessageAttachment[];
  context?: unknown;
}) => undefined | CreateTaskConfig | Promise<undefined | CreateTaskConfig>;

export interface ConversationMessageHookPayload {
  taskId: string;
  message: ChatMessage;
  context?: unknown;
}

/**
 * 服务器构造选项
 */
export interface AmigoServerOptions {
  /** 服务器配置 */
  config: ServerConfig;
  /** 工具注册表 */
  toolRegistry?: ToolRegistry;
  /** 消息注册表 */
  messageRegistry?: MessageRegistry;
  /** 模型工厂（可选，默认从环境变量创建） */
  llmFactory?: LlmFactory;
  /** 额外自动批准的工具名称（在内置默认列表之外） */
  autoApproveToolNames?: string[];
  /** 使用 SDK 覆盖默认自动批准工具名称 */
  defaultAutoApproveToolNames?: string[];
  /** 全局追加系统提示词（应用级特化） */
  extraSystemPrompt?: string;
  /** 使用 SDK 覆盖基础工具集合 */
  baseTools?: Partial<Record<WorkflowPromptScope, ToolInterface<unknown>[]>>;
  /** 使用 SDK 覆盖默认 system prompt */
  systemPrompts?: Partial<Record<WorkflowPromptScope, string>>;
  /** 宿主环境规则提供器 */
  ruleProvider?: RuleProvider;
  /** 可注入的 sandbox manager */
  sandboxManager?: SandboxManager;
  /** 可注入的会话 persistence provider */
  conversationPersistenceProvider?: ConversationPersistenceProvider;
  /** 按模型配置 provider、baseURL、上下文窗口与压缩参数 */
  modelConfigs?: Record<string, ModelConfig>;
  /** 兼容旧命名，后续建议使用 modelConfigs */
  modelContextConfigs?: Record<string, ModelContextConfig>;
  /** 日志配置 */
  loggerConfig?: Partial<LoggerConfig>;
  /** 会话创建完成后的 app 层 hook */
  onConversationCreate?: (payload: { taskId: string; context?: unknown }) => void | Promise<void>;
  /** 会话消息产生后的 app 层 hook */
  onConversationMessage?: (payload: ConversationMessageHookPayload) => void | Promise<void>;
  /** 在 createTask 真正创建会话前解析自定义 prompt / 工具白名单 / 初始上下文 */
  createTaskConfigResolver?: CreateTaskConfigResolver;
  /** 执行子会话 finishPhase 扩展校验 hook */
  taskExecutionCompletionValidator?: (
    payload: TaskExecutionCompletionValidationHookPayload,
  ) => TaskExecutionValidationResult | Promise<TaskExecutionValidationResult>;
  /** 执行子会话完成后的自动 verification hook */
  taskExecutionVerificationEvaluator?: (
    payload: TaskExecutionVerificationHookPayload,
  ) => TaskExecutionVerificationResult | Promise<TaskExecutionVerificationResult>;
  /** 应用层可注入的按用户解析模型配置方法 */
  userModelConfigResolver?: (payload: {
    userId?: string;
    selection: string | ModelSelection;
  }) => ResolvedModelConfig | null;
  /** SDK 内置 memory 系统 */
  memory?: MemoryConfig;
  /** editFile 后置诊断 provider */
  editFileDiagnosticsProvider?: EditFileDiagnosticsProvider;
  /** 可注入的语言运行时宿主管理器 */
  languageRuntimeHostManager?: LanguageRuntimeHostManager;
  /** LSP server 配置 */
  lsp?: LspConfig;
}

/**
 * 服务接口暴露
 */
class AmigoServer {
  private readonly port: number;
  private readonly webSocketMessageHandler: ServerWebSocketMessageHandler;
  private _toolRegistry?: ToolRegistry;
  private _messageRegistry?: MessageRegistry;
  private _server?: Bun.Server<AmigoWebSocketData>;

  constructor(options: AmigoServerOptions) {
    if (!options.conversationPersistenceProvider) {
      throw new Error(
        "AmigoServer requires a conversationPersistenceProvider. The backend SDK no longer falls back to file storage.",
      );
    }
    this.port = options.config.port;
    this._toolRegistry = options.toolRegistry;
    this._messageRegistry = options.messageRegistry;
    this.webSocketMessageHandler = new ServerWebSocketMessageHandler(options.messageRegistry);

    if (options.loggerConfig) {
      configureLogger(options.loggerConfig);
    }
    setGlobalState("globalStoragePath", options.config.storagePath);
    setGlobalState("globalCachePath", options.config.cachePath);
    setLlmFactory(options.llmFactory);

    if (options.toolRegistry) {
      setGlobalState("registryTools", options.toolRegistry.getAll());
    }
    if (options.messageRegistry) {
      setGlobalState("registryMessages", options.messageRegistry.getAll());
    }
    setGlobalState("autoApproveToolNames", options.autoApproveToolNames || []);
    setGlobalState("defaultAutoApproveToolNames", options.defaultAutoApproveToolNames);
    setGlobalState("extraSystemPrompt", options.extraSystemPrompt || "");
    setGlobalState("baseTools", options.baseTools || {});
    setGlobalState("systemPrompts", options.systemPrompts || {});
    setGlobalState("ruleProvider", options.ruleProvider);
    setGlobalState("sandboxManager", options.sandboxManager);
    setGlobalState("conversationPersistenceProvider", options.conversationPersistenceProvider);
    const modelConfigs = options.modelConfigs ?? options.modelContextConfigs;
    setGlobalState("modelConfigs", modelConfigs);
    setGlobalState("modelContextConfigs", modelConfigs);
    setGlobalState("onConversationCreate", options.onConversationCreate);
    setGlobalState("onConversationMessage", options.onConversationMessage);
    setGlobalState("createTaskConfigResolver", options.createTaskConfigResolver);
    setGlobalState("taskExecutionCompletionValidator", options.taskExecutionCompletionValidator);
    setGlobalState(
      "taskExecutionVerificationEvaluator",
      options.taskExecutionVerificationEvaluator,
    );
    setGlobalState("userModelConfigResolver", options.userModelConfigResolver);
    setGlobalState("memoryConfig", options.memory);
    setGlobalState("editFileDiagnosticsProvider", options.editFileDiagnosticsProvider);
    setGlobalState("languageRuntimeHostManager", options.languageRuntimeHostManager);
    setGlobalState("lspConfig", options.lsp);
    setGlobalState(
      "memoryRuntime",
      options.memory ? new SdkMemoryRuntime(options.memory) : undefined,
    );
  }

  get toolRegistry(): ToolRegistry | undefined {
    return this._toolRegistry;
  }

  get messageRegistry(): MessageRegistry | undefined {
    return this._messageRegistry;
  }

  get serverHandle(): Bun.Server<AmigoWebSocketData> | undefined {
    return this._server;
  }

  get isRunning(): boolean {
    return !!this._server;
  }

  tryUpgradeConversationWebSocket(
    req: Request,
    server: Bun.Server,
    data: Omit<ConversationWebSocketData, "kind"> = {},
  ): boolean {
    return server.upgrade(req, { data: { kind: "conversation", ...data } });
  }

  async handleWebSocketMessage(ws: ServerWebSocket, message: string | Buffer): Promise<void> {
    if (typeof message !== "string") {
      ws.close(1003, "Unsupported binary websocket message");
      return;
    }

    await this.webSocketMessageHandler.handleMessage(ws, message);
  }

  async handleWebSocketOpen(ws: ServerWebSocket): Promise<void> {
    await this.webSocketMessageHandler.handleOpen(ws);
  }

  handleWebSocketClose(ws: ServerWebSocket, _code: number, _reason: string): void {
    this.webSocketMessageHandler.handleClose(ws);
  }

  start(): Bun.Server<AmigoWebSocketData> {
    if (this._server) {
      return this._server;
    }

    this._server = Bun.serve({
      fetch: async (req, server) => {
        if (
          (req.headers.get("upgrade") || "").toLowerCase() === "websocket" &&
          this.tryUpgradeConversationWebSocket(req, server)
        ) {
          return;
        }

        return new Response("Not Found", { status: 404 });
      },
      port: this.port,
      websocket: {
        data: {} as AmigoWebSocketData,
        message: (ws: ServerWebSocket<AmigoWebSocketData>, message: string | Buffer) =>
          this.handleWebSocketMessage(ws, message),
        open: (ws: ServerWebSocket<AmigoWebSocketData>) => this.handleWebSocketOpen(ws),
        close: (ws: ServerWebSocket<AmigoWebSocketData>, code: number, reason: string) =>
          this.handleWebSocketClose(ws, code, reason),
        drain: () => {},
      },
    });

    return this._server;
  }

  /**
   * 兼容旧 API。建议使用 start()
   */
  init(): Bun.Server<AmigoWebSocketData> {
    return this.start();
  }

  stop(): void {
    if (!this._server) {
      return;
    }
    this._server.stop();
    this._server = undefined;
  }
}

export default AmigoServer;

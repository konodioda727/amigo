import Bun, { type ServerWebSocket } from "bun";
import { setGlobalState } from "@/globalState";
import type { ServerConfig } from "../config";
import { type LlmFactory, setLlmFactory } from "../model";
import type { MessageRegistry, ToolRegistry } from "../registry";
import { ServerHttpRequestHandler } from "./httpRequestHandler";
import { ServerWebSocketMessageHandler } from "./webSocketMessageHandler";

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
  /** 全局追加系统提示词（应用级特化） */
  extraSystemPrompt?: string;
}

/**
 * 服务接口暴露
 */
class AmigoServer {
  private readonly port: number;
  private readonly httpRequestHandler = new ServerHttpRequestHandler();
  private readonly webSocketMessageHandler: ServerWebSocketMessageHandler;
  private _toolRegistry?: ToolRegistry;
  private _messageRegistry?: MessageRegistry;
  private _server?: ReturnType<typeof Bun.serve>;

  constructor(options: AmigoServerOptions) {
    this.port = options.config.port;
    this._toolRegistry = options.toolRegistry;
    this._messageRegistry = options.messageRegistry;
    this.webSocketMessageHandler = new ServerWebSocketMessageHandler(options.messageRegistry);

    setGlobalState("globalStoragePath", options.config.storagePath);
    setLlmFactory(options.llmFactory);

    if (options.toolRegistry) {
      setGlobalState("registryTools", options.toolRegistry.getAll());
    }
    if (options.messageRegistry) {
      setGlobalState("registryMessages", options.messageRegistry.getAll());
    }
    setGlobalState("autoApproveToolNames", options.autoApproveToolNames || []);
    setGlobalState("extraSystemPrompt", options.extraSystemPrompt || "");
  }

  get toolRegistry(): ToolRegistry | undefined {
    return this._toolRegistry;
  }

  get messageRegistry(): MessageRegistry | undefined {
    return this._messageRegistry;
  }

  get serverHandle(): ReturnType<typeof Bun.serve> | undefined {
    return this._server;
  }

  get isRunning(): boolean {
    return !!this._server;
  }

  start(): ReturnType<typeof Bun.serve> {
    if (this._server) {
      return this._server;
    }

    this._server = Bun.serve({
      fetch: async (req, server) => {
        const httpResponse = await this.httpRequestHandler.handle(req);
        if (httpResponse) {
          return httpResponse;
        }

        if (server.upgrade(req)) {
          return;
        }
        return new Response("Upgrade failed", { status: 500 });
      },
      port: this.port,
      websocket: {
        message: async (ws: ServerWebSocket, message: string) => {
          await this.webSocketMessageHandler.handleMessage(ws, message);
        },
        open: async (ws: ServerWebSocket) => {
          await this.webSocketMessageHandler.handleOpen(ws);
        },
        close: (ws: ServerWebSocket) => {
          this.webSocketMessageHandler.handleClose(ws);
        },
        drain: () => {},
      },
    });

    return this._server;
  }

  /**
   * 兼容旧 API。建议使用 start()
   */
  init(): ReturnType<typeof Bun.serve> {
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

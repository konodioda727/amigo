import { logger } from "@amigo-llm/backend";
import Bun, { type ServerWebSocket } from "bun";
import { getAuthenticatedUserId } from "../auth/betterAuth";
import type { AmigoHttpHandler } from "../http/appHttpHandler";

interface PreviewProxyWebSocketData {
  kind: "hosted-proxy";
  label: "preview" | "editor";
  upstreamUrl: string;
  protocols: string[];
  upstream?: WebSocket;
  pendingMessages: Array<string | Buffer>;
}

interface ConversationWebSocketData {
  kind: "conversation";
  userId?: string;
}

type AppWebSocketData = PreviewProxyWebSocketData | ConversationWebSocketData | undefined;

interface ConversationRuntimeServer {
  tryUpgradeConversationWebSocket(
    req: Request,
    server: Bun.Server<AppWebSocketData>,
    data?: Omit<ConversationWebSocketData, "kind">,
  ): boolean;
  handleWebSocketMessage(ws: ServerWebSocket, message: string | Buffer): Promise<void>;
  handleWebSocketOpen(ws: ServerWebSocket): Promise<void>;
  handleWebSocketClose(ws: ServerWebSocket, code: number, reason: string): void;
}

interface AmigoAppServerOptions {
  port: number;
  runtimeServer: ConversationRuntimeServer;
  httpHandler: AmigoHttpHandler;
}

export class AmigoAppServer {
  private readonly port: number;
  private readonly runtimeServer: ConversationRuntimeServer;
  private readonly httpHandler: AmigoHttpHandler;
  private _server?: Bun.Server<AppWebSocketData>;

  constructor(options: AmigoAppServerOptions) {
    this.port = options.port;
    this.runtimeServer = options.runtimeServer;
    this.httpHandler = options.httpHandler;
  }

  get serverHandle(): Bun.Server<AppWebSocketData> | undefined {
    return this._server;
  }

  get isRunning(): boolean {
    return !!this._server;
  }

  start(): Bun.Server<AppWebSocketData> {
    if (this._server) {
      return this._server;
    }

    this._server = Bun.serve({
      port: this.port,
      fetch: async (req, server) => {
        const isWebSocketRequest = (req.headers.get("upgrade") || "").toLowerCase() === "websocket";

        if (isWebSocketRequest) {
          const hostedProxyTarget = await this.httpHandler.resolveHostedWebSocketProxyTarget(req);
          if (hostedProxyTarget) {
            logger.info(
              `[${hostedProxyTarget.label === "preview" ? "PreviewHost" : "EditorHost"}][WS] 升级请求 host=${new URL(req.url).host} path=${new URL(req.url).pathname} upstream=${hostedProxyTarget.upstreamUrl}`,
            );
            const upgraded = server.upgrade(req, {
              data: {
                kind: "hosted-proxy",
                label: hostedProxyTarget.label,
                upstreamUrl: hostedProxyTarget.upstreamUrl,
                protocols: hostedProxyTarget.protocols,
                pendingMessages: [],
              },
            });
            if (!upgraded) {
              return new Response("Hosted websocket upgrade failed", { status: 502 });
            }
            return;
          }

          const userId = await getAuthenticatedUserId(req);
          if (!userId?.trim()) {
            return new Response("Unauthorized", { status: 401 });
          }

          if (this.runtimeServer.tryUpgradeConversationWebSocket(req, server, { userId })) {
            return;
          }

          return new Response("Upgrade failed", { status: 500 });
        }

        const response = await this.httpHandler.handle(req);
        return response || new Response("Not Found", { status: 404 });
      },
      websocket: {
        data: {} as AppWebSocketData,
        message: (ws: ServerWebSocket<AppWebSocketData>, message: string | Buffer) => {
          if (ws.data?.kind === "hosted-proxy") {
            if (!ws.data.upstream || ws.data.upstream.readyState !== WebSocket.OPEN) {
              ws.data.pendingMessages.push(message);
              return;
            }
            ws.data.upstream.send(message);
            return;
          }

          return this.runtimeServer.handleWebSocketMessage(ws as ServerWebSocket, message);
        },
        open: (ws: ServerWebSocket<AppWebSocketData>) => {
          if (ws.data?.kind === "hosted-proxy") {
            const label = ws.data.label === "preview" ? "PreviewHost" : "EditorHost";
            logger.info(
              `[${label}][WS] 建立下游连接 upstream=${ws.data.upstreamUrl} protocols=${ws.data.protocols.join(",")}`,
            );
            const upstream = new WebSocket(
              ws.data.upstreamUrl,
              ws.data.protocols.length > 0 ? ws.data.protocols : undefined,
            );
            upstream.binaryType = "arraybuffer";
            ws.data.upstream = upstream;

            upstream.onopen = () => {
              const currentLabel =
                ws.data?.kind === "hosted-proxy" && ws.data.label === "preview"
                  ? "PreviewHost"
                  : "EditorHost";
              logger.info(
                `[${currentLabel}][WS] 上游连接已打开 upstream=${(ws.data as PreviewProxyWebSocketData)?.upstreamUrl || ""}`,
              );
              const buffered =
                ws.data?.kind === "hosted-proxy" ? ws.data.pendingMessages.splice(0) : [];
              for (const pendingMessage of buffered) {
                upstream.send(pendingMessage);
              }
            };
            upstream.onmessage = (event) => {
              const payload = event.data;
              if (typeof payload === "string") {
                ws.sendText(payload);
                return;
              }
              if (payload instanceof ArrayBuffer) {
                ws.sendBinary(payload);
                return;
              }
              if (ArrayBuffer.isView(payload)) {
                ws.sendBinary(
                  new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength),
                );
                return;
              }
              ws.sendText(String(payload));
            };
            upstream.onerror = (event) => {
              const currentLabel =
                ws.data?.kind === "hosted-proxy" && ws.data.label === "preview"
                  ? "PreviewHost"
                  : "EditorHost";
              logger.error(
                `[${currentLabel}][WS] 上游连接出错 upstream=${(ws.data as PreviewProxyWebSocketData)?.upstreamUrl || ""}`,
                event,
              );
              ws.close(1011, `${currentLabel} upstream websocket error`);
            };
            upstream.onclose = (event) => {
              const currentLabel =
                ws.data?.kind === "hosted-proxy" && ws.data.label === "preview"
                  ? "PreviewHost"
                  : "EditorHost";
              logger.warn(
                `[${currentLabel}][WS] 上游连接关闭 upstream=${(ws.data as PreviewProxyWebSocketData)?.upstreamUrl || ""} code=${event.code} reason=${event.reason}`,
              );
              ws.close(event.code || 1000, event.reason || "");
            };
            return;
          }

          return this.runtimeServer.handleWebSocketOpen(ws as ServerWebSocket);
        },
        close: (ws: ServerWebSocket<AppWebSocketData>, code: number, reason: string) => {
          if (ws.data?.kind === "hosted-proxy") {
            const label = ws.data.label === "preview" ? "PreviewHost" : "EditorHost";
            logger.info(
              `[${label}][WS] 下游连接关闭 upstream=${ws.data.upstreamUrl} code=${code} reason=${reason}`,
            );
            ws.data.upstream?.close(code, reason);
            return;
          }

          this.runtimeServer.handleWebSocketClose(ws as ServerWebSocket, code, reason);
        },
        drain: () => {},
      },
    });

    return this._server;
  }

  stop(): void {
    if (!this._server) {
      return;
    }

    this._server.stop();
    this._server = undefined;
  }
}

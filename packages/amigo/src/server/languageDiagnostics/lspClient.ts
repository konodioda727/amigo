import {
  type LanguageRuntimeHost,
  type LspRuntimeContext,
  type LspServerDefinition,
  logger,
  type StdioProcess,
} from "@amigo-llm/backend";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface LspDiagnostic {
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
  range?: {
    start?: { line?: number; character?: number };
    end?: { line?: number; character?: number };
  };
}

interface PublishDiagnosticsParams {
  uri: string;
  version?: number;
  diagnostics?: LspDiagnostic[];
}

interface LspPosition {
  line: number;
  character: number;
}

interface LspLocation {
  uri: string;
  range?: {
    start?: LspPosition;
    end?: LspPosition;
  };
}

interface LspLocationLink {
  targetUri: string;
  targetRange?: {
    start?: LspPosition;
    end?: LspPosition;
  };
  targetSelectionRange?: {
    start?: LspPosition;
    end?: LspPosition;
  };
}

interface DocumentState {
  version: number;
  languageId: string;
  text: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface DiagnosticsWaiter {
  baselineRevision: number;
  resolve: (value: PublishDiagnosticsParams | undefined) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
const HEADER_SEPARATOR = Buffer.from("\r\n\r\n", "utf8");

const toFileUri = (absolutePath: string): string => {
  const url = new URL("file:///");
  url.pathname = absolutePath;
  return url.toString();
};

const basename = (value: string): string => {
  const normalized = value.replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) || normalized : normalized;
};

export interface LspClientOptions {
  host: LanguageRuntimeHost;
  server: LspServerDefinition;
  workspaceRoot: string;
  runtimeContext: LspRuntimeContext;
}

export class LspClient {
  private readonly host: LanguageRuntimeHost;
  private readonly server: LspServerDefinition;
  private readonly workspaceRoot: string;
  private readonly runtimeContext: LspRuntimeContext;
  private readonly requestTimeoutMs: number;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private readonly diagnosticsByUri = new Map<string, PublishDiagnosticsParams>();
  private readonly diagnosticRevisions = new Map<string, number>();
  private readonly diagnosticsWaiters = new Map<string, DiagnosticsWaiter[]>();
  private readonly documentStates = new Map<string, DocumentState>();
  private stdoutBuffer = Buffer.alloc(0);
  private nextRequestId = 1;
  private process: StdioProcess | null = null;
  private initialized = false;
  private closed = false;
  private workspaceConfiguration: unknown;

  constructor(options: LspClientOptions) {
    this.host = options.host;
    this.server = options.server;
    this.workspaceRoot = options.workspaceRoot;
    this.runtimeContext = options.runtimeContext;
    this.requestTimeoutMs = options.server.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  getDiagnosticsRevision(uri: string): number {
    return this.diagnosticRevisions.get(uri) || 0;
  }

  async start(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const initializationOptions =
      typeof this.server.initializationOptions === "function"
        ? await this.server.initializationOptions(this.runtimeContext)
        : this.server.initializationOptions;
    this.workspaceConfiguration =
      typeof this.server.workspaceConfiguration === "function"
        ? await this.server.workspaceConfiguration(this.runtimeContext)
        : this.server.workspaceConfiguration;

    this.process = await this.host.spawnStdioProcess({
      command: this.server.command,
      args: this.server.args,
      env: this.server.env,
      cwd: this.workspaceRoot,
    });

    this.process.onStdout((chunk) => {
      this.handleStdout(chunk);
    });
    this.process.onStderr((chunk) => {
      const message = Buffer.from(chunk).toString("utf8").trim();
      if (message) {
        logger.debug(`[LspClient:${this.server.id}] stderr: ${message}`);
      }
    });
    this.process.onExit((event) => {
      this.handleExit(event.code);
    });

    const workspaceUri = toFileUri(this.workspaceRoot);
    await this.sendRequest("initialize", {
      processId: null,
      clientInfo: {
        name: "amigo",
      },
      rootUri: workspaceUri,
      capabilities: {
        workspace: {
          configuration: true,
          workspaceFolders: true,
        },
        textDocument: {
          synchronization: {
            didSave: true,
            dynamicRegistration: false,
          },
          publishDiagnostics: {
            relatedInformation: true,
          },
        },
      },
      workspaceFolders: [
        {
          uri: workspaceUri,
          name: basename(this.workspaceRoot),
        },
      ],
      initializationOptions,
    });

    await this.sendNotification("initialized", {});

    if (this.workspaceConfiguration !== undefined) {
      await this.sendNotification("workspace/didChangeConfiguration", {
        settings: this.workspaceConfiguration,
      });
    }

    this.initialized = true;
  }

  async syncDocument(params: {
    absoluteFilePath: string;
    languageId: string;
    text: string;
  }): Promise<PublishDiagnosticsParams | undefined> {
    await this.start();

    const uri = toFileUri(params.absoluteFilePath);
    const previousRevision = this.getDiagnosticsRevision(uri);
    const existing = this.documentStates.get(uri);
    if (!existing) {
      this.documentStates.set(uri, {
        version: 1,
        languageId: params.languageId,
        text: params.text,
      });
      await this.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: params.languageId,
          version: 1,
          text: params.text,
        },
      });
    } else {
      const nextVersion = existing.version + 1;
      this.documentStates.set(uri, {
        version: nextVersion,
        languageId: params.languageId,
        text: params.text,
      });
      await this.sendNotification("textDocument/didChange", {
        textDocument: {
          uri,
          version: nextVersion,
        },
        contentChanges: [{ text: params.text }],
      });
    }

    await this.sendNotification("textDocument/didSave", {
      textDocument: { uri },
    });

    return this.waitForDiagnostics(uri, previousRevision, this.requestTimeoutMs);
  }

  async goToDefinition(params: {
    absoluteFilePath: string;
    line: number;
    column: number;
  }): Promise<LspLocation[]> {
    await this.start();
    const result = await this.sendRequest("textDocument/definition", {
      textDocument: {
        uri: toFileUri(params.absoluteFilePath),
      },
      position: {
        line: Math.max(0, params.line - 1),
        character: Math.max(0, params.column - 1),
      },
    });
    return this.normalizeLocations(result);
  }

  async findReferences(params: {
    absoluteFilePath: string;
    line: number;
    column: number;
    includeDeclaration?: boolean;
  }): Promise<LspLocation[]> {
    await this.start();
    const result = await this.sendRequest("textDocument/references", {
      textDocument: {
        uri: toFileUri(params.absoluteFilePath),
      },
      position: {
        line: Math.max(0, params.line - 1),
        character: Math.max(0, params.column - 1),
      },
      context: {
        includeDeclaration: params.includeDeclaration ?? true,
      },
    });
    return this.normalizeLocations(result);
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    try {
      if (this.initialized) {
        await this.sendRequest("shutdown", undefined);
        await this.sendNotification("exit", undefined);
      }
    } catch {}

    const processHandle = this.process;
    this.process = null;
    if (processHandle) {
      await processHandle.kill().catch(() => {});
    }
    this.rejectPendingRequests(new Error(`LSP client closed: ${this.server.id}`));
    this.clearDiagnosticsWaiters();
  }

  private async waitForDiagnostics(
    uri: string,
    baselineRevision: number,
    timeoutMs: number,
  ): Promise<PublishDiagnosticsParams | undefined> {
    if (this.getDiagnosticsRevision(uri) > baselineRevision) {
      return this.diagnosticsByUri.get(uri);
    }

    return new Promise<PublishDiagnosticsParams | undefined>((resolve) => {
      const timeout = setTimeout(() => {
        this.removeDiagnosticsWaiter(uri, waiter);
        resolve(undefined);
      }, timeoutMs);
      const waiter: DiagnosticsWaiter = {
        baselineRevision,
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        timeout,
      };
      this.diagnosticsWaiters.set(uri, [...(this.diagnosticsWaiters.get(uri) || []), waiter]);
    });
  }

  private removeDiagnosticsWaiter(uri: string, target: DiagnosticsWaiter): void {
    const waiters = this.diagnosticsWaiters.get(uri) || [];
    const next = waiters.filter((waiter) => waiter !== target);
    if (next.length > 0) {
      this.diagnosticsWaiters.set(uri, next);
      return;
    }
    this.diagnosticsWaiters.delete(uri);
  }

  private clearDiagnosticsWaiters(): void {
    for (const [uri, waiters] of this.diagnosticsWaiters.entries()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout);
        waiter.resolve(undefined);
      }
      this.diagnosticsWaiters.delete(uri);
    }
  }

  private handleExit(code?: number): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.process = null;
    this.rejectPendingRequests(
      new Error(`LSP process exited (${this.server.id}, code=${String(code)})`),
    );
    this.clearDiagnosticsWaiters();
  }

  private rejectPendingRequests(error: Error): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }

  private async sendNotification(method: string, params: unknown): Promise<void> {
    await this.writeMessage({
      jsonrpc: "2.0",
      method,
      ...(params !== undefined ? { params } : {}),
    } satisfies JsonRpcNotification);
  }

  private async sendResponse(id: number, result: unknown): Promise<void> {
    await this.writeMessage({
      jsonrpc: "2.0",
      id,
      result,
    } satisfies JsonRpcResponse);
  }

  private async sendRequest(method: string, params: unknown): Promise<unknown> {
    const id = this.nextRequestId++;
    let rejectPending!: (error: Error) => void;
    const requestPromise = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request timed out: ${method}`));
      }, this.requestTimeoutMs);
      rejectPending = reject;
      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout,
      });
    });

    try {
      await this.writeMessage({
        jsonrpc: "2.0",
        id,
        method,
        ...(params !== undefined ? { params } : {}),
      } satisfies JsonRpcRequest);
    } catch (error) {
      const pending = this.pendingRequests.get(id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(id);
      }
      rejectPending(error instanceof Error ? error : new Error(String(error)));
    }

    return requestPromise;
  }

  private async writeMessage(
    message: JsonRpcRequest | JsonRpcNotification | JsonRpcResponse,
  ): Promise<void> {
    if (!this.process || this.closed) {
      throw new Error(`LSP process unavailable: ${this.server.id}`);
    }

    const payload = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n`;
    await this.process.write(`${header}${payload}`);
  }

  private handleStdout(chunk: Uint8Array): void {
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, Buffer.from(chunk)]);

    while (true) {
      const headerEnd = this.stdoutBuffer.indexOf(HEADER_SEPARATOR);
      if (headerEnd < 0) {
        return;
      }

      const headerText = this.stdoutBuffer.subarray(0, headerEnd).toString("utf8");
      const contentLengthMatch = /Content-Length:\s*(\d+)/i.exec(headerText);
      const contentLength = Number.parseInt(contentLengthMatch?.[1] || "", 10);
      if (!Number.isFinite(contentLength)) {
        throw new Error(`Invalid LSP header: ${headerText}`);
      }

      const messageStart = headerEnd + HEADER_SEPARATOR.length;
      if (this.stdoutBuffer.length < messageStart + contentLength) {
        return;
      }

      const payload = this.stdoutBuffer
        .subarray(messageStart, messageStart + contentLength)
        .toString("utf8");
      this.stdoutBuffer = this.stdoutBuffer.subarray(messageStart + contentLength);

      const parsed = JSON.parse(payload) as
        | JsonRpcResponse
        | JsonRpcNotification
        | (JsonRpcRequest & { id?: number });
      void this.handleIncomingMessage(parsed).catch((error) => {
        logger.warn(
          `[LspClient:${this.server.id}] 处理消息失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }
  }

  private async handleIncomingMessage(
    message: JsonRpcResponse | JsonRpcNotification | (JsonRpcRequest & { id?: number }),
  ): Promise<void> {
    if ("id" in message && "method" in message && typeof message.id === "number") {
      await this.sendResponse(
        message.id,
        this.resolveServerRequest(message.method, message.params),
      );
      return;
    }

    if ("id" in message && !("method" in message) && typeof message.id === "number") {
      const pending = this.pendingRequests.get(message.id);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
        return;
      }
      pending.resolve(message.result);
      return;
    }

    if (!("method" in message)) {
      return;
    }

    if (message.method === "textDocument/publishDiagnostics") {
      this.handlePublishDiagnostics(message.params as PublishDiagnosticsParams);
      return;
    }
  }

  private resolveServerRequest(method: string, params: unknown): unknown {
    if (method === "workspace/configuration") {
      const items =
        params &&
        typeof params === "object" &&
        Array.isArray((params as { items?: unknown[] }).items)
          ? (params as { items?: unknown[] }).items || []
          : [];
      return items.map(() => this.workspaceConfiguration ?? null);
    }

    return null;
  }

  private handlePublishDiagnostics(params: PublishDiagnosticsParams): void {
    const normalized: PublishDiagnosticsParams = {
      uri: params.uri,
      version: params.version,
      diagnostics: Array.isArray(params.diagnostics) ? params.diagnostics : [],
    };
    this.diagnosticsByUri.set(normalized.uri, normalized);
    const nextRevision = this.getDiagnosticsRevision(normalized.uri) + 1;
    this.diagnosticRevisions.set(normalized.uri, nextRevision);

    const waiters = this.diagnosticsWaiters.get(normalized.uri) || [];
    const remaining: DiagnosticsWaiter[] = [];
    for (const waiter of waiters) {
      if (nextRevision > waiter.baselineRevision) {
        clearTimeout(waiter.timeout);
        waiter.resolve(normalized);
        continue;
      }
      remaining.push(waiter);
    }

    if (remaining.length > 0) {
      this.diagnosticsWaiters.set(normalized.uri, remaining);
      return;
    }
    this.diagnosticsWaiters.delete(normalized.uri);
  }

  private normalizeLocations(value: unknown): LspLocation[] {
    if (!value) {
      return [];
    }

    const items = Array.isArray(value) ? value : [value];
    return items
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const location = item as Partial<LspLocation>;
        if (typeof location.uri === "string") {
          return {
            uri: location.uri,
            range: location.range,
          } satisfies LspLocation;
        }

        const link = item as Partial<LspLocationLink>;
        if (typeof link.targetUri === "string") {
          return {
            uri: link.targetUri,
            range: link.targetSelectionRange || link.targetRange,
          } satisfies LspLocation;
        }

        return null;
      })
      .filter((item): item is LspLocation => !!item);
  }
}

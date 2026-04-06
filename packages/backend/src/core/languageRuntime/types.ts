export interface SpawnStdioProcessParams {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  signal?: AbortSignal;
}

export interface StdioProcessExit {
  code?: number;
  signal?: string;
}

export interface StdioProcess {
  write(data: string | Uint8Array): Promise<void>;
  closeInput(): Promise<void>;
  kill(): Promise<void>;
  onStdout(listener: (chunk: Uint8Array) => void): () => void;
  onStderr(listener: (chunk: Uint8Array) => void): () => void;
  onExit(listener: (event: StdioProcessExit) => void): () => void;
}

export interface LanguageRuntimeHost {
  id: string;
  cwd: string;
  runCommand(cmd: string, signal?: AbortSignal): Promise<string | undefined>;
  spawnStdioProcess(params: SpawnStdioProcessParams): Promise<StdioProcess>;
}

export interface LanguageRuntimeHostManager {
  get(taskId: string): LanguageRuntimeHost | undefined;
  getOrCreate(taskId: string, context?: unknown): Promise<LanguageRuntimeHost>;
  destroy?(taskId: string): Promise<void>;
}

export interface LspRuntimeContext {
  taskId: string;
  filePath: string;
  conversationContext?: unknown;
  host: LanguageRuntimeHost;
}

export interface LspServerDefinition {
  id: string;
  languageIds: string[];
  fileExtensions: string[];
  command: string;
  args?: string[];
  env?: Record<string, string>;
  rootMarkers?: string[];
  requestTimeoutMs?: number;
  initializationOptions?: unknown | ((context: LspRuntimeContext) => unknown | Promise<unknown>);
  workspaceConfiguration?: unknown | ((context: LspRuntimeContext) => unknown | Promise<unknown>);
  capabilities?: {
    definition?: boolean;
    references?: boolean;
    diagnostics?: boolean;
  };
  enabledWhen?: (context: LspRuntimeContext) => boolean | Promise<boolean>;
}

export interface LspConfig {
  servers: LspServerDefinition[];
  idleShutdownMs?: number;
  rootResolver?: (context: LspRuntimeContext) => string | Promise<string>;
}

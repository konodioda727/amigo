import path from "node:path";
import {
  createLanguageRuntimeHostManagerFromSandboxManager,
  getGlobalState,
  type LanguageRuntimeHost,
  type LanguageRuntimeHostManager,
  type LspConfig,
  type LspRuntimeContext,
  type LspServerDefinition,
  logger,
  type Sandbox,
} from "@amigo-llm/backend";
import type { EditFileDiagnostics } from "@amigo-llm/types";
import { LspClient } from "./lspClient";

const SUPPORTED_TS_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);
const SUPPORTED_PY_EXTENSIONS = new Set([".py"]);

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'"'"'`)}'`;

const normalizeSlashes = (value: string): string => value.replace(/\\/g, "/");

export const getLanguageForPath = (filePath: string): EditFileDiagnostics["language"] | null => {
  const normalized = filePath.trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  const extension = dotIndex >= 0 ? normalized.slice(dotIndex) : "";
  if (SUPPORTED_TS_EXTENSIONS.has(extension)) {
    return "typescript";
  }
  if (SUPPORTED_PY_EXTENSIONS.has(extension)) {
    return "python";
  }
  return null;
};

const defaultReadLspConfig = (): LspConfig | undefined => getGlobalState("lspConfig");
const defaultReadHostManager = (): LanguageRuntimeHostManager | undefined =>
  getGlobalState("languageRuntimeHostManager");

const buildToolUnavailableDiagnostics = (
  language: NonNullable<ReturnType<typeof getLanguageForPath>>,
  summary?: string,
): EditFileDiagnostics => ({
  language,
  status: "tool_unavailable",
  summary:
    summary || `${language === "typescript" ? "TypeScript" : "Python"} LSP 诊断不可用，已跳过。`,
  errorCount: 0,
  diagnostics: [],
});

const toAbsoluteHostPath = (cwd: string, filePath: string): string => {
  const normalizedFilePath = normalizeSlashes(filePath.trim());
  if (!normalizedFilePath) {
    return normalizeSlashes(cwd);
  }
  if (normalizedFilePath.startsWith("/")) {
    return normalizedFilePath;
  }
  return path.posix.resolve(normalizeSlashes(cwd), normalizedFilePath);
};

const inferLanguageId = (filePath: string, server: LspServerDefinition): string => {
  const normalized = filePath.trim().toLowerCase();
  if (normalized.endsWith(".tsx")) {
    return "typescriptreact";
  }
  if (normalized.endsWith(".ts") || normalized.endsWith(".mts") || normalized.endsWith(".cts")) {
    return "typescript";
  }
  if (normalized.endsWith(".jsx")) {
    return "javascriptreact";
  }
  if (normalized.endsWith(".js") || normalized.endsWith(".mjs") || normalized.endsWith(".cjs")) {
    return "javascript";
  }
  if (normalized.endsWith(".py")) {
    return "python";
  }
  return server.languageIds[0] || "plaintext";
};

const createSandboxBackedHost = (taskId: string, sandbox: Sandbox): LanguageRuntimeHost => ({
  id: taskId,
  cwd: "/sandbox",
  runCommand: (cmd, signal) => sandbox.runCommand(cmd, signal),
  spawnStdioProcess: (params) =>
    sandbox.spawnStdioProcess({
      ...params,
      cwd: params.cwd?.trim() || "/sandbox",
    }),
});

export interface LanguageDiagnosticsParams {
  taskId: string;
  filePath: string;
  content: string;
  conversationContext?: unknown;
  sandbox?: Sandbox;
}

export interface SymbolLocationResult {
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  preview?: string;
}

export interface SymbolAnchor {
  symbolName: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  preview?: string;
}

export interface SymbolLookupResult {
  success: boolean;
  message: string;
  anchor?: SymbolAnchor;
  locations: SymbolLocationResult[];
}

export interface GoToDefinitionParams {
  taskId: string;
  filePath: string;
  symbolName: string;
  line: number;
  column: number;
  conversationContext?: unknown;
  sandbox?: Sandbox;
}

export interface FindReferencesParams extends GoToDefinitionParams {
  includeDeclaration?: boolean;
}

export interface LanguageIntelligenceServiceOptions {
  readLspConfig?: () => LspConfig | undefined;
  readLanguageRuntimeHostManager?: () => LanguageRuntimeHostManager | undefined;
}

export class LanguageIntelligenceService {
  private static readonly SYMBOL_ANCHOR_MAX_LINE_DISTANCE = 6;
  private readonly readLspConfig: () => LspConfig | undefined;
  private readonly readLanguageRuntimeHostManager: () => LanguageRuntimeHostManager | undefined;
  private readonly clients = new Map<string, LspClient>();
  private readonly idleShutdownTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: LanguageIntelligenceServiceOptions = {}) {
    this.readLspConfig = options.readLspConfig || defaultReadLspConfig;
    this.readLanguageRuntimeHostManager =
      options.readLanguageRuntimeHostManager || defaultReadHostManager;
  }

  async getDiagnostics(
    params: LanguageDiagnosticsParams,
  ): Promise<EditFileDiagnostics | undefined> {
    const language = getLanguageForPath(params.filePath);
    if (!language) {
      return undefined;
    }

    const config = this.readLspConfig();
    if (!config || config.servers.length === 0) {
      return buildToolUnavailableDiagnostics(
        language,
        `${language === "typescript" ? "TypeScript" : "Python"} LSP 未配置。`,
      );
    }

    try {
      const host = await this.resolveHost(params);
      const absoluteFilePath = toAbsoluteHostPath(host.cwd, params.filePath);
      const runtimeContext: LspRuntimeContext = {
        taskId: params.taskId,
        filePath: absoluteFilePath,
        conversationContext: params.conversationContext,
        host,
      };
      const server = await this.resolveServer(config, runtimeContext, "diagnostics");
      if (!server) {
        return buildToolUnavailableDiagnostics(
          language,
          `${language === "typescript" ? "TypeScript" : "Python"} 未匹配到可用的 LSP server。`,
        );
      }

      const workspaceRoot = await this.resolveWorkspaceRoot(config, server, runtimeContext);
      const cacheKey = `${host.id}:${workspaceRoot}:${server.id}`;
      const client = await this.getOrCreateClient(cacheKey, {
        host,
        server,
        workspaceRoot,
        runtimeContext,
      });
      const publish = await client.syncDocument({
        absoluteFilePath,
        languageId: inferLanguageId(absoluteFilePath, server),
        text: params.content,
      });
      this.bumpIdleShutdown(config, cacheKey, client);

      if (!publish) {
        return buildToolUnavailableDiagnostics(
          language,
          `${language === "typescript" ? "TypeScript" : "Python"} LSP 诊断超时。`,
        );
      }

      return this.toEditFileDiagnostics(language, params.filePath, publish.diagnostics || []);
    } catch (error) {
      logger.warn(
        `[LanguageIntelligenceService] LSP diagnostics failed for ${params.filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return buildToolUnavailableDiagnostics(
        language,
        `${language === "typescript" ? "TypeScript" : "Python"} LSP 诊断失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async goToDefinition(params: GoToDefinitionParams): Promise<SymbolLookupResult> {
    return this.resolveSymbolLocations("definition", params);
  }

  async findReferences(params: FindReferencesParams): Promise<SymbolLookupResult> {
    return this.resolveSymbolLocations("references", params);
  }

  private async resolveHost(params: LanguageDiagnosticsParams): Promise<LanguageRuntimeHost> {
    const hostManager = this.readLanguageRuntimeHostManager();
    if (hostManager) {
      return hostManager.getOrCreate(params.taskId, params.conversationContext);
    }
    if (params.sandbox) {
      return createSandboxBackedHost(params.taskId, params.sandbox);
    }
    const sandboxManager = getGlobalState("sandboxManager");
    if (sandboxManager) {
      return createLanguageRuntimeHostManagerFromSandboxManager(sandboxManager).getOrCreate(
        params.taskId,
        params.conversationContext,
      );
    }
    throw new Error("language runtime host is unavailable");
  }

  private async resolveSymbolLocations(
    mode: "definition" | "references",
    params: GoToDefinitionParams | FindReferencesParams,
  ): Promise<SymbolLookupResult> {
    const config = this.readLspConfig();
    if (!config || config.servers.length === 0) {
      return {
        success: false,
        message: "当前应用未配置 LSP，无法执行语义查询。",
        locations: [],
      };
    }

    const host = await this.resolveHost({
      taskId: params.taskId,
      filePath: params.filePath,
      content: "",
      conversationContext: params.conversationContext,
      sandbox: params.sandbox,
    });
    const absoluteFilePath = toAbsoluteHostPath(host.cwd, params.filePath);
    const content = await this.readFileContent(host, absoluteFilePath);
    const anchor = resolveSymbolAnchor({
      content,
      symbolName: params.symbolName,
      line: params.line,
      column: params.column,
      maxLineDistance: LanguageIntelligenceService.SYMBOL_ANCHOR_MAX_LINE_DISTANCE,
    });
    if (!anchor) {
      return {
        success: false,
        message: `未能在 ${params.filePath}:${params.line}:${params.column} 附近定位到符号 "${params.symbolName}"。`,
        locations: [],
      };
    }
    const runtimeContext: LspRuntimeContext = {
      taskId: params.taskId,
      filePath: absoluteFilePath,
      conversationContext: params.conversationContext,
      host,
    };
    const server = await this.resolveServer(
      config,
      runtimeContext,
      mode === "definition" ? "definition" : "references",
    );
    if (!server) {
      return {
        success: false,
        message: `文件 ${params.filePath} 没有匹配到可用的 LSP server。`,
        anchor,
        locations: [],
      };
    }
    const workspaceRoot = await this.resolveWorkspaceRoot(config, server, runtimeContext);
    const cacheKey = `${host.id}:${workspaceRoot}:${server.id}`;
    const client = await this.getOrCreateClient(cacheKey, {
      host,
      server,
      workspaceRoot,
      runtimeContext,
    });
    await client.syncDocument({
      absoluteFilePath,
      languageId: inferLanguageId(absoluteFilePath, server),
      text: content,
    });

    const rawLocations =
      mode === "definition"
        ? await client.goToDefinition({
            absoluteFilePath,
            line: anchor.line,
            column: anchor.column,
          })
        : await client.findReferences({
            absoluteFilePath,
            line: anchor.line,
            column: anchor.column,
            includeDeclaration:
              "includeDeclaration" in params ? params.includeDeclaration : undefined,
          });
    this.bumpIdleShutdown(config, cacheKey, client);

    const results: SymbolLocationResult[] = [];
    for (const location of rawLocations) {
      const targetAbsolutePath = this.fromFileUri(location.uri);
      const preview = await this.readPreview(host, targetAbsolutePath, location.range?.start?.line);
      results.push({
        filePath: this.toReturnedPath(host, targetAbsolutePath),
        line: (location.range?.start?.line ?? 0) + 1,
        column: (location.range?.start?.character ?? 0) + 1,
        endLine:
          typeof location.range?.end?.line === "number" ? location.range.end.line + 1 : undefined,
        endColumn:
          typeof location.range?.end?.character === "number"
            ? location.range.end.character + 1
            : undefined,
        ...(preview ? { preview } : {}),
      });
    }
    return {
      success: true,
      message:
        mode === "definition"
          ? results.length > 0
            ? `找到 ${results.length} 个定义位置`
            : `已定位符号 "${params.symbolName}"，但没有找到定义位置`
          : results.length > 0
            ? `找到 ${results.length} 个引用位置`
            : `已定位符号 "${params.symbolName}"，但没有找到引用位置`,
      anchor,
      locations: results,
    };
  }

  private async resolveServer(
    config: LspConfig,
    runtimeContext: LspRuntimeContext,
    capability: "diagnostics" | "definition" | "references",
  ): Promise<LspServerDefinition | undefined> {
    const normalizedPath = runtimeContext.filePath.toLowerCase();
    for (const server of config.servers) {
      const supportsCapability = server.capabilities?.[capability] !== false;
      if (!supportsCapability) {
        continue;
      }
      if (
        !server.fileExtensions.some((extension) => normalizedPath.endsWith(extension.toLowerCase()))
      ) {
        continue;
      }
      if (server.enabledWhen && !(await server.enabledWhen(runtimeContext))) {
        continue;
      }
      return server;
    }
    return undefined;
  }

  private async resolveWorkspaceRoot(
    config: LspConfig,
    server: LspServerDefinition,
    runtimeContext: LspRuntimeContext,
  ): Promise<string> {
    if (config.rootResolver) {
      return toAbsoluteHostPath(runtimeContext.host.cwd, await config.rootResolver(runtimeContext));
    }

    const markers = server.rootMarkers?.filter(Boolean) || [];
    if (markers.length === 0) {
      return runtimeContext.host.cwd;
    }

    const markerList = markers.map((marker) => shellQuote(marker)).join(" ");
    const command = `
target=${shellQuote(runtimeContext.filePath)}
dir=$(dirname "$target")
while true; do
  for marker in ${markerList}; do
    if [ -e "$dir/$marker" ]; then
      printf '%s' "$dir"
      exit 0
    fi
  done
  if [ "$dir" = "/" ]; then
    break
  fi
  dir=$(dirname "$dir")
done
printf '%s' ${shellQuote(runtimeContext.host.cwd)}
`.trim();
    const output = ((await runtimeContext.host.runCommand(command)) || "").trim();
    return output || runtimeContext.host.cwd;
  }

  private async getOrCreateClient(
    cacheKey: string,
    options: ConstructorParameters<typeof LspClient>[0],
  ): Promise<LspClient> {
    const existing = this.clients.get(cacheKey);
    if (existing && !existing.isClosed) {
      return existing;
    }

    if (existing) {
      this.clients.delete(cacheKey);
    }

    const client = new LspClient(options);
    this.clients.set(cacheKey, client);
    await client.start();
    return client;
  }

  private async readFileContent(
    host: LanguageRuntimeHost,
    absoluteFilePath: string,
  ): Promise<string> {
    return (await host.runCommand(`cat ${shellQuote(absoluteFilePath)}`)) || "";
  }

  private async readPreview(
    host: LanguageRuntimeHost,
    absoluteFilePath: string,
    zeroBasedLine?: number,
  ): Promise<string | undefined> {
    const line = Math.max(1, (zeroBasedLine ?? 0) + 1);
    const output = (
      await host.runCommand(`sed -n '${line}p' ${shellQuote(absoluteFilePath)}`)
    )?.trim();
    return output || undefined;
  }

  private fromFileUri(uri: string): string {
    const url = new URL(uri);
    return normalizeSlashes(decodeURIComponent(url.pathname));
  }

  private toReturnedPath(host: LanguageRuntimeHost, absoluteFilePath: string): string {
    const hostRoot = normalizeSlashes(host.cwd).replace(/\/+$/, "");
    const normalized = normalizeSlashes(absoluteFilePath);
    if (hostRoot && normalized.startsWith(`${hostRoot}/`)) {
      return normalized.slice(hostRoot.length + 1);
    }
    return normalized;
  }

  private bumpIdleShutdown(config: LspConfig, cacheKey: string, client: LspClient): void {
    const idleShutdownMs = config.idleShutdownMs || 0;
    const existingTimer = this.idleShutdownTimers.get(cacheKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.idleShutdownTimers.delete(cacheKey);
    }
    if (idleShutdownMs <= 0) {
      return;
    }
    const timer = setTimeout(() => {
      this.idleShutdownTimers.delete(cacheKey);
      this.clients.delete(cacheKey);
      void client.close().catch(() => {});
    }, idleShutdownMs);
    this.idleShutdownTimers.set(cacheKey, timer);
  }

  private toEditFileDiagnostics(
    language: EditFileDiagnostics["language"],
    filePath: string,
    diagnostics: Array<{
      severity?: number;
      code?: string | number;
      message: string;
      range?: {
        start?: { line?: number; character?: number };
        end?: { line?: number; character?: number };
      };
    }>,
  ): EditFileDiagnostics {
    const mapped = diagnostics
      .map((item) => {
        const severity = item.severity === 1 ? "error" : item.severity === 2 ? "warning" : null;
        if (!severity) {
          return null;
        }
        return {
          source: language,
          severity,
          filePath,
          line: (item.range?.start?.line ?? 0) + 1,
          column: (item.range?.start?.character ?? 0) + 1,
          endLine: typeof item.range?.end?.line === "number" ? item.range.end.line + 1 : undefined,
          endColumn:
            typeof item.range?.end?.character === "number"
              ? item.range.end.character + 1
              : undefined,
          code: item.code !== undefined ? String(item.code) : undefined,
          message: item.message,
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item);

    const errorCount = mapped.filter((item) => item.severity === "error").length;
    const warningCount = mapped.filter((item) => item.severity === "warning").length;
    if (errorCount > 0) {
      return {
        language,
        status: "error",
        summary: `${language === "typescript" ? "TypeScript" : "Python"} LSP 诊断发现 ${errorCount} 个错误`,
        errorCount,
        diagnostics: mapped,
      };
    }

    return {
      language,
      status: "clean",
      summary:
        warningCount > 0
          ? `${language === "typescript" ? "TypeScript" : "Python"} LSP 诊断未发现错误，另有 ${warningCount} 个警告`
          : `${language === "typescript" ? "TypeScript" : "Python"} LSP 诊断未发现错误`,
      errorCount: 0,
      diagnostics: mapped,
    };
  }
}

const IDENTIFIER_CHAR_PATTERN = /[A-Za-z0-9_$]/;

const isIdentifierBoundary = (value: string | undefined): boolean =>
  !value || !IDENTIFIER_CHAR_PATTERN.test(value);

interface ResolveSymbolAnchorParams {
  content: string;
  symbolName: string;
  line: number;
  column: number;
  maxLineDistance: number;
}

interface SymbolCandidate {
  lineIndex: number;
  columnIndex: number;
  lineDistance: number;
  columnDistance: number;
  preview: string;
}

const resolveSymbolAnchor = (params: ResolveSymbolAnchorParams): SymbolAnchor | undefined => {
  const symbolName = params.symbolName.trim();
  if (!symbolName) {
    return undefined;
  }

  const lines = params.content.split("\n");
  if (lines.length === 0 || params.line < 1 || params.line > lines.length || params.column < 1) {
    return undefined;
  }

  const requestedLineIndex = params.line - 1;
  const requestedColumnIndex = params.column - 1;
  const startLine = Math.max(0, requestedLineIndex - params.maxLineDistance);
  const endLine = Math.min(lines.length - 1, requestedLineIndex + params.maxLineDistance);
  let bestCandidate: SymbolCandidate | undefined;

  for (let lineIndex = startLine; lineIndex <= endLine; lineIndex += 1) {
    const lineText = lines[lineIndex] || "";
    let searchIndex = 0;
    while (searchIndex <= lineText.length - symbolName.length) {
      const matchIndex = lineText.indexOf(symbolName, searchIndex);
      if (matchIndex < 0) {
        break;
      }

      const before = matchIndex > 0 ? lineText[matchIndex - 1] : undefined;
      const after =
        matchIndex + symbolName.length < lineText.length
          ? lineText[matchIndex + symbolName.length]
          : undefined;
      searchIndex = matchIndex + symbolName.length;

      if (!isIdentifierBoundary(before) || !isIdentifierBoundary(after)) {
        continue;
      }

      const candidate: SymbolCandidate = {
        lineIndex,
        columnIndex: matchIndex,
        lineDistance: Math.abs(lineIndex - requestedLineIndex),
        columnDistance: Math.abs(matchIndex - requestedColumnIndex),
        preview: lineText.trim(),
      };

      if (
        !bestCandidate ||
        candidate.lineDistance < bestCandidate.lineDistance ||
        (candidate.lineDistance === bestCandidate.lineDistance &&
          candidate.columnDistance < bestCandidate.columnDistance) ||
        (candidate.lineDistance === bestCandidate.lineDistance &&
          candidate.columnDistance === bestCandidate.columnDistance &&
          candidate.columnIndex < bestCandidate.columnIndex)
      ) {
        bestCandidate = candidate;
      }
    }
  }

  if (!bestCandidate) {
    return undefined;
  }

  return {
    symbolName,
    line: bestCandidate.lineIndex + 1,
    column: bestCandidate.columnIndex + 1,
    endLine: bestCandidate.lineIndex + 1,
    endColumn: bestCandidate.columnIndex + symbolName.length + 1,
    preview: bestCandidate.preview || undefined,
  };
};

let defaultLanguageIntelligenceService: LanguageIntelligenceService | null = null;

export const getDefaultLanguageIntelligenceService = (): LanguageIntelligenceService => {
  if (!defaultLanguageIntelligenceService) {
    defaultLanguageIntelligenceService = new LanguageIntelligenceService();
  }
  return defaultLanguageIntelligenceService;
};

export const __testing__ = {
  buildToolUnavailableDiagnostics,
  getLanguageForPath,
  resolveSymbolAnchor,
};

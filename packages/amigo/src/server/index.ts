import path from "node:path";
import type { LspConfig } from "@amigo-llm/backend";
import { createAmigoApp } from "./app";

const isNonFatalStreamError = (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason || "");
  return (
    message.includes("Failed to parse stream") || message.includes("Error reading from the stream")
  );
};

process.on("unhandledRejection", (reason) => {
  if (isNonFatalStreamError(reason)) {
    console.warn(`[amigo] ignore non-fatal stream rejection: ${String(reason)}`);
    return;
  }
  console.error("[amigo] unhandled rejection", reason);
});

process.on("uncaughtException", (error) => {
  if (isNonFatalStreamError(error)) {
    console.warn(`[amigo] ignore non-fatal stream error: ${error.message}`);
    return;
  }
  console.error("[amigo] uncaught exception", error);
});

const readPositiveInteger = (value: string | undefined): number | undefined => {
  const parsed = Number.parseInt((value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const envPort = readPositiveInteger(process.env.AMIGO_PORT);
const envCachePath = (process.env.AMIGO_CACHE_PATH || "").trim();
const envSandboxMemoryMb = readPositiveInteger(process.env.AMIGO_SANDBOX_MEMORY_MB);
const envSandboxImage = (process.env.AMIGO_SANDBOX_IMAGE || "").trim();
const envSandboxRuntime = (process.env.AMIGO_SANDBOX_RUNTIME || "").trim();
const envPreviewBaseDomain = (process.env.AMIGO_PREVIEW_BASE_DOMAIN || "").trim();
const envPreviewProtocol = (process.env.AMIGO_PREVIEW_PUBLIC_PROTOCOL || "").trim();
const normalizedPreviewProtocol =
  envPreviewProtocol === "http" || envPreviewProtocol === "https" ? envPreviewProtocol : undefined;

const DEFAULT_QDRANT_MEMORY_CONFIG = {
  url: "http://127.0.0.1:6333",
  collectionPrefix: "amigo_memory",
  longTerm: {
    enabled: true,
    topK: 6,
    minScore: 0.15,
    minConfidence: 0.8,
  },
  retrieval: {
    hybrid: true,
  },
} as const;

const DEFAULT_AMIGO_LSP_CONFIG: LspConfig = {
  idleShutdownMs: 5 * 60 * 1000,
  servers: [
    {
      id: "typescript",
      languageIds: ["typescript", "typescriptreact", "javascript", "javascriptreact"],
      fileExtensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
      command: "typescript-language-server",
      args: ["--stdio"],
      rootMarkers: ["tsconfig.json", "jsconfig.json", "package.json", ".git"],
      capabilities: {
        diagnostics: true,
        definition: true,
        references: true,
      },
    },
    {
      id: "python",
      languageIds: ["python"],
      fileExtensions: [".py"],
      command: "pyright-langserver",
      args: ["--stdio"],
      rootMarkers: ["pyrightconfig.json", "pyproject.toml", "requirements.txt", ".git"],
      capabilities: {
        diagnostics: true,
        definition: true,
        references: true,
      },
    },
  ],
};

const start = async () => {
  const app = await createAmigoApp({
    ...(envPort ? { port: envPort } : {}),
    ...(envCachePath ? { cachePath: path.resolve(envCachePath) } : {}),
    ...(envSandboxImage || envSandboxRuntime || envSandboxMemoryMb
      ? {
          sandboxConfig: {
            ...(envSandboxImage ? { imageName: envSandboxImage } : {}),
            ...(envSandboxRuntime ? { runtime: envSandboxRuntime } : {}),
            ...(envSandboxMemoryMb ? { memoryLimitBytes: envSandboxMemoryMb * 1024 * 1024 } : {}),
          },
        }
      : {}),
    ...(envPreviewBaseDomain || envPreviewProtocol
      ? {
          previewHostConfig: {
            ...(envPreviewBaseDomain ? { baseDomain: envPreviewBaseDomain } : {}),
            ...(normalizedPreviewProtocol ? { publicProtocol: normalizedPreviewProtocol } : {}),
          },
        }
      : {}),
    qdrantMemory: DEFAULT_QDRANT_MEMORY_CONFIG,
    lsp: DEFAULT_AMIGO_LSP_CONFIG,
  });
  app.server.start();

  console.log(`[amigo] server started on :${app.port}`);
};

void start().catch((error) => {
  console.error("[amigo] failed to start", error);
  process.exitCode = 1;
});

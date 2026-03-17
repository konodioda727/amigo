import path from "node:path";
import {
  AmigoServerBuilder,
  bindGithubContextToTask,
  type LoggerConfig,
  MODEL_PROVIDERS,
  type ModelConfig,
  type SandboxOptions,
  SandboxRegistry,
} from "@amigo-llm/backend";
import dotenv from "dotenv";
import {
  USER_CODING_AGENT_AUTO_APPROVE_TOOLS,
  USER_CODING_AGENT_TOOLS,
} from "./appTools/codingAgentTools";
import type { PenpotSyncConfig } from "./appTools/designDocTools/penpotSync/types";
import type { PreviewHostConfig } from "./config/previewHost";
import { configureAppRuntimeConfig } from "./config/runtimeConfig";
import { createAmigoHttpHandler } from "./http/appHttpHandler";
import { AMIGO_APP_SYSTEM_PROMPT_APPENDIX } from "./prompts/amigoAppPrompt";
import { AmigoAppServer } from "./runtime/appServer";
import type { OssUploadConfig } from "./utils/ossUpload";

dotenv.config({ path: path.resolve(import.meta.dir, "..", "..", ".env") });

export interface AmigoAppOptions {
  port?: number;
  cachePath?: string;
  loggerConfig?: Partial<LoggerConfig>;
  modelConfigs?: Record<string, ModelConfig | number>;
  sandboxConfig?: SandboxOptions;
  previewHostConfig?: PreviewHostConfig;
  ossConfig?: OssUploadConfig | null;
  penpotConfig?: Partial<PenpotSyncConfig> | null;
}

export interface AmigoApp {
  server: AmigoAppServer;
  sandboxManager: SandboxRegistry;
  port: number;
  cachePath: string;
}

const DEFAULT_SANDBOX_MEMORY_MB = 2048;

const resolveSandboxConfig = (config?: SandboxOptions): SandboxOptions => ({
  imageName: config?.imageName?.trim() || "ai_sandbox",
  runtime: config?.runtime?.trim() || (process.platform === "darwin" ? "runc" : "runsc"),
  memoryLimitBytes: config?.memoryLimitBytes || DEFAULT_SANDBOX_MEMORY_MB * 1024 * 1024,
});

const resolvePreviewHostConfig = (config?: PreviewHostConfig): PreviewHostConfig => ({
  baseDomain: config?.baseDomain,
  publicProtocol: config?.publicProtocol ?? "https",
});

export function createAmigoApp(options: AmigoAppOptions = {}): AmigoApp {
  const port = options.port ?? 10013;
  const cachePath = options.cachePath || path.resolve(process.cwd(), ".amigo");
  const sandboxManager = new SandboxRegistry(resolveSandboxConfig(options.sandboxConfig));
  configureAppRuntimeConfig({
    ossUploadConfig: options.ossConfig,
    penpotConfig: options.penpotConfig,
  });
  const doubaoConfig: ModelConfig = {
    provider: MODEL_PROVIDERS.OPENAI_COMPATIBLE,
    baseURL: "https://ark.cn-beijing.volces.com/api/coding/v3",
    contextWindow: 256000,
    compressionThreshold: 0.8,
    targetRatio: 0.5,
  };
  const modelConfigs = options.modelConfigs || {
    "doubao-seed-2.0-pro": doubaoConfig,
  };
  let builder = new AmigoServerBuilder().port(port).cachePath(cachePath);
  if (options.loggerConfig) {
    builder = builder.loggerConfig(options.loggerConfig);
  }
  for (const tool of USER_CODING_AGENT_TOOLS) {
    builder = builder.registerTool(tool);
  }

  const runtimeServer = builder
    .addAutoApproveTools([...USER_CODING_AGENT_AUTO_APPROVE_TOOLS])
    .appendSystemPrompt(AMIGO_APP_SYSTEM_PROMPT_APPENDIX)
    .modelConfigs(modelConfigs)
    .cachePath("./.amigo")
    .sandboxManager(sandboxManager)
    .onConversationCreate(async ({ taskId, context }) => {
      await bindGithubContextToTask(taskId, context);
      await sandboxManager.getOrCreate(taskId);
    })
    .build();

  const httpHandler = createAmigoHttpHandler({
    sandboxManager,
    previewHostConfig: resolvePreviewHostConfig(options.previewHostConfig),
  });
  const server = new AmigoAppServer({
    port,
    runtimeServer,
    httpHandler,
  });

  return { server, sandboxManager, port, cachePath };
}

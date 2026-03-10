import path from "node:path";
import { AmigoServerBuilder, bindGithubContextToTask, SandboxRegistry } from "@amigo-llm/backend";
import dotenv from "dotenv";
import {
  USER_CODING_AGENT_AUTO_APPROVE_TOOLS,
  USER_CODING_AGENT_SYSTEM_PROMPT_APPENDIX,
  USER_CODING_AGENT_TOOLS,
} from "./appTools/codingAgentTools";
import { createAmigoHttpHandler } from "./http/appHttpHandler";
import { AmigoAppServer } from "./runtime/appServer";

dotenv.config({ path: path.resolve(import.meta.dir, "..", "..", ".env") });

export interface AmigoAppOptions {
  port?: number;
  storagePath?: string;
}

export interface AmigoApp {
  server: AmigoAppServer;
  sandboxManager: SandboxRegistry;
}

const DEFAULT_SANDBOX_MEMORY_MB = 2048;

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveSandboxConfig = () => ({
  imageName: process.env.AMIGO_SANDBOX_IMAGE?.trim() || "ai_sandbox",
  runtime:
    process.env.AMIGO_SANDBOX_RUNTIME?.trim() || (process.platform === "darwin" ? "runc" : "runsc"),
  memoryLimitBytes:
    toPositiveInt(process.env.AMIGO_SANDBOX_MEMORY_MB, DEFAULT_SANDBOX_MEMORY_MB) * 1024 * 1024,
});

const resolvePreviewHostConfig = () => ({
  baseDomain: process.env.AMIGO_PREVIEW_BASE_DOMAIN,
  publicProtocol: process.env.AMIGO_PREVIEW_PUBLIC_PROTOCOL || "https",
});

export function createAmigoApp(options: AmigoAppOptions = {}): AmigoApp {
  const port = options.port || Number(process.env.SERVER_PORT) || 10013;
  const storagePath =
    options.storagePath || process.env.STORAGE_PATH || path.resolve(process.cwd(), "storage");
  const sandboxManager = new SandboxRegistry(resolveSandboxConfig());

  let builder = new AmigoServerBuilder().port(port).storagePath(storagePath);
  for (const tool of USER_CODING_AGENT_TOOLS) {
    builder = builder.registerTool(tool);
  }

  const runtimeServer = builder
    .addAutoApproveTools([...USER_CODING_AGENT_AUTO_APPROVE_TOOLS])
    .appendSystemPrompt(USER_CODING_AGENT_SYSTEM_PROMPT_APPENDIX)
    .sandboxManager(sandboxManager)
    .onConversationCreate(async ({ taskId, context }) => {
      await bindGithubContextToTask(taskId, context);
      await sandboxManager.getOrCreate(taskId);
    })
    .build();

  const httpHandler = createAmigoHttpHandler({
    sandboxManager,
    previewHostConfig: resolvePreviewHostConfig(),
  });
  const server = new AmigoAppServer({
    port,
    runtimeServer,
    httpHandler,
  });

  return { server, sandboxManager };
}

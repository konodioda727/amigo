import path from "node:path";
import {
  AmigoServerBuilder,
  bindGithubContextToTask,
  conversationRepository,
  getGlobalState,
  type LoggerConfig,
  logger,
  MODEL_PROVIDERS,
  type ModelConfig,
  type SandboxOptions,
  SandboxRegistry,
  SkillRuntime,
  taskOrchestrator,
} from "@amigo-llm/backend";
import dotenv from "dotenv";
import { getUserCodingAgentTools } from "./appTools/codingAgentTools";
import type { PenpotSyncConfig } from "./appTools/designDocTools/penpotSync/types";
import { AutomationScheduler } from "./automations/automationScheduler";
import { type AutomationDefinition, AutomationStore } from "./automations/automationStore";
import type { PreviewHostConfig } from "./config/previewHost";
import { configureAppRuntimeConfig } from "./config/runtimeConfig";
import { createAmigoHttpHandler } from "./http/appHttpHandler";
import { ConversationChannelRouter } from "./integrations/channels/router";
import { createFeishuBridge, type FeishuBridge } from "./integrations/feishu/bridge";
import { AMIGO_APP_SYSTEM_PROMPT_APPENDIX } from "./prompts/amigoAppPrompt";
import { AmigoAppServer } from "./runtime/appServer";
import { SkillHubMarketClient } from "./skills/skillHubMarket";
import { SkillStore } from "./skills/skillStore";
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
  skillStore: SkillStore;
  automationStore: AutomationStore;
  automationScheduler: AutomationScheduler;
  feishuBridge: FeishuBridge;
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
  const skillStore = new SkillStore(cachePath);
  const skillRuntime = new SkillRuntime(skillStore);
  const skillHubMarketClient = new SkillHubMarketClient();
  const automationStore = new AutomationStore(cachePath, async () => {
    const skills = await skillStore.list();
    return new Set(skills.map((skill) => skill.id));
  });
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

  const resolveTaskConfigFromContext = async (context: unknown) => {
    const resolved = await skillRuntime.resolveCreateTaskConfig(context);
    if (resolved) {
      return resolved;
    }
    return context !== undefined ? { context } : undefined;
  };

  const runAutomationTask = async (automation: AutomationDefinition): Promise<void> => {
    const automationContext = {
      ...(automation.context || {}),
      ...(automation.skillIds?.length ? { skillIds: automation.skillIds } : {}),
      automationId: automation.id,
      automationName: automation.name,
      trigger: "automation",
    };
    const sourceTaskId =
      typeof automationContext.sourceTaskId === "string"
        ? automationContext.sourceTaskId.trim()
        : "";
    const taskConfig = await resolveTaskConfigFromContext(automationContext);
    const conversation = conversationRepository.create({
      type: "main",
      ...(sourceTaskId ? { parentId: sourceTaskId } : {}),
      customPrompt: taskConfig?.customPrompt,
    });

    if (taskConfig?.context !== undefined) {
      conversation.memory.setContext(taskConfig.context);
    }

    taskOrchestrator.setUserInput(conversation, automation.prompt);

    const onConversationCreate = getGlobalState("onConversationCreate");
    if (onConversationCreate) {
      await onConversationCreate({
        taskId: conversation.id,
        context: conversation.memory.context ?? taskConfig?.context,
      });
    }

    const executor = taskOrchestrator.getExecutor(conversation.id);
    executor.execute(conversation);
  };

  const automationScheduler = new AutomationScheduler(automationStore, runAutomationTask);
  const feishuBridge = createFeishuBridge({
    cachePath,
    resolveTaskConfig: resolveTaskConfigFromContext,
  });
  const channelRouter = new ConversationChannelRouter([feishuBridge]);
  let builder = new AmigoServerBuilder().port(port).cachePath(cachePath);
  if (options.loggerConfig) {
    builder = builder.loggerConfig(options.loggerConfig);
  }
  for (const tool of getUserCodingAgentTools(automationStore, automationScheduler)) {
    builder = builder.registerTool(tool);
  }

  const runtimeServer = builder
    .appendSystemPrompt(AMIGO_APP_SYSTEM_PROMPT_APPENDIX)
    .modelConfigs(modelConfigs)
    .sandboxManager(sandboxManager)
    .skills({ provider: skillStore })
    .addAutoApproveTools(builder.toolRegistry.getAll().map((tool) => tool.name))
    .onConversationCreate(async ({ taskId, context }) => {
      const conversation = conversationRepository.get(taskId);
      const taskContext = conversation?.memory.context ?? context;
      const githubBinding = await bindGithubContextToTask(taskId, taskContext);
      const repoUrl =
        taskContext && typeof taskContext === "object" && "repoUrl" in taskContext
          ? String((taskContext as { repoUrl?: unknown }).repoUrl || "").trim()
          : "";
      if (repoUrl) {
        const sandboxOwnerTaskId = conversation?.parentId || taskId;
        logger.info(
          `[AmigoApp] 预热 task sandbox task=${taskId} sandboxOwner=${sandboxOwnerTaskId} repo=${repoUrl}`,
        );
        await sandboxManager.getOrCreate(sandboxOwnerTaskId, undefined, githubBinding);
      }
    })
    .onConversationMessage(async (payload) => {
      await channelRouter.dispatchConversationMessage(payload);
    })
    .build();

  const httpHandler = createAmigoHttpHandler({
    sandboxManager,
    previewHostConfig: resolvePreviewHostConfig(options.previewHostConfig),
    skillStore,
    skillHubMarketClient,
    automationStore,
    automationScheduler,
  });
  const server = new AmigoAppServer({
    port,
    runtimeServer,
    httpHandler,
  });

  void skillStore.init();
  void automationStore.init();
  void automationScheduler.start();
  feishuBridge.start();

  return {
    server,
    sandboxManager,
    skillStore,
    automationStore,
    automationScheduler,
    feishuBridge,
    port,
    cachePath,
  };
}

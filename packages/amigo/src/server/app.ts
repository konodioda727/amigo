import path from "node:path";
import {
  AmigoServerBuilder,
  bindGithubContextToTask,
  CUSTOMED_TOOLS,
  conversationRepository,
  getBaseTools,
  getGlobalState,
  type LoggerConfig,
  logger,
  type ModelConfig,
  type SandboxOptions,
  SandboxRegistry,
  SkillRuntime,
  taskOrchestrator,
} from "@amigo-llm/backend";
import dotenv from "dotenv";
import { getUserCodingAgentTools } from "./appTools/codingAgentTools";
import { AutomationScheduler } from "./automations/automationScheduler";
import { type AutomationDefinition, AutomationStore } from "./automations/automationStore";
import type { PreviewHostConfig } from "./config/previewHost";
import { configureAppRuntimeConfig } from "./config/runtimeConfig";
import {
  createMysqlConversationPersistenceProvider,
  listNotificationChannels,
  requireMysqlConfigured,
} from "./db";
import { createAmigoHttpHandler } from "./http/appHttpHandler";
import { ConversationChannelRouter } from "./integrations/channels/router";
import { createFeishuBridge, type FeishuBridge } from "./integrations/feishu/bridge";
import { resolveUserScopedModelConfig, warmUserModelConfigStore } from "./modelConfigs/store";
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
  modelConfigs?: Record<string, ModelConfig>;
  sandboxConfig?: SandboxOptions;
  previewHostConfig?: PreviewHostConfig;
  ossConfig?: OssUploadConfig | null;
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const ASK_FOLLOWUP_TOOL_NAME = "askFollowupQuestion";

const AUTOMATION_EXECUTION_PROMPT = `
当前轮是一个已经触发的 automation 执行，不是在创建、修改或确认 automation。
你的职责是直接完成 automation 当前这次运行要做的事情。
如果这是提醒、通知、闹钟、催办之类的 automation，现在就应该直接发出提醒内容，不要再次询问“要设置哪种提醒”“是否要创建提醒”“要不要确认提醒内容”。
禁止调用 askFollowupQuestion。
除非任务内容明确要求管理 automation，本轮不要调用 upsertAutomation。
如果信息不完整，优先根据已有 prompt 和 context 做合理假设并直接执行；只有在确实无法执行时，才直接说明缺失原因并结束当前轮。
`.trim();

const mergeCustomPrompts = (...prompts: Array<string | undefined>): string | undefined => {
  const merged = prompts.map((prompt) => prompt?.trim()).filter(Boolean);
  return merged.length > 0 ? merged.join("\n\n") : undefined;
};

const extractToolNames = (tools: unknown): string[] => {
  if (!Array.isArray(tools)) {
    return [];
  }

  return tools
    .map((tool) =>
      tool && typeof tool === "object" && "name" in tool ? String(tool.name || "").trim() : "",
    )
    .filter(Boolean);
};

const resolveAutomationToolNames = (requestedToolNames?: string[]): string[] => {
  const fallbackToolNames = Array.from(
    new Set([
      ...getBaseTools("main").map((tool) => tool.name),
      ...CUSTOMED_TOOLS.map((tool) => tool.name),
      ...extractToolNames(getGlobalState("registryTools")),
    ]),
  );

  const selectedToolNames =
    requestedToolNames?.map((name) => name.trim()).filter(Boolean) || fallbackToolNames;

  return selectedToolNames.filter((name) => name !== ASK_FOLLOWUP_TOOL_NAME);
};

const resolveExistingAutomationParentId = (sourceTaskId: string): string | undefined => {
  const normalizedTaskId = sourceTaskId.trim();
  if (!normalizedTaskId) {
    return undefined;
  }

  const existingConversation =
    conversationRepository.get(normalizedTaskId) || conversationRepository.load(normalizedTaskId);
  if (existingConversation) {
    return normalizedTaskId;
  }

  logger.warn(
    `[AmigoApp] automation sourceTaskId=${normalizedTaskId} 不存在，跳过 parentId 绑定，仅保留在 context 中`,
  );
  return undefined;
};

export async function createAmigoApp(options: AmigoAppOptions = {}): Promise<AmigoApp> {
  requireMysqlConfigured();
  await warmUserModelConfigStore();
  const port = options.port ?? 10013;
  const cachePath = options.cachePath || path.resolve(process.cwd(), ".amigo");
  const sandboxManager = new SandboxRegistry(resolveSandboxConfig(options.sandboxConfig));
  const persistenceProvider = await createMysqlConversationPersistenceProvider();
  const skillStore = new SkillStore(cachePath);
  const skillRuntime = new SkillRuntime(skillStore);
  const skillHubMarketClient = new SkillHubMarketClient();
  const automationStore = new AutomationStore(cachePath, async () => {
    const skills = await skillStore.list();
    return new Set(skills.map((skill) => skill.id));
  });
  const resolveAutomationChannels = async (automation: AutomationDefinition) => {
    const automationContext = automation.context;
    if (
      isPlainObject(automationContext) &&
      isPlainObject(automationContext.feishu) &&
      typeof automationContext.feishu.chatId === "string"
    ) {
      return { feishu: automationContext.feishu };
    }

    const userId =
      isPlainObject(automationContext) && typeof automationContext.userId === "string"
        ? automationContext.userId.trim()
        : "";
    if (!userId) {
      return {};
    }

    const channels = await listNotificationChannels(userId, "feishu");
    const defaultChannel =
      channels.find((channel) => channel.enabled && channel.isDefault) || channels[0];
    if (!defaultChannel) {
      return {};
    }

    return {
      feishu: defaultChannel.config,
    };
  };
  configureAppRuntimeConfig({
    ossUploadConfig: options.ossConfig,
  });
  // const arkConfig: ModelConfig = {
  //   provider: MODEL_PROVIDERS.OPENAI_COMPATIBLE,
  //   apiKey: "",
  //   baseURL: "https://ark.cn-beijing.volces.com/api/coding/v3",
  //   compressionThreshold: 0.8,
  //   targetRatio: 0.5,
  //   models: [
  //     {
  //       name: "doubao-seed-2.0-pro",
  //       contextWindow: 256000,
  //       thinkType: "enabled",
  //     },
  //   ],
  // };
  const modelConfigs = options.modelConfigs;

  const resolveTaskConfigFromContext = async (context: unknown) => {
    const resolved = await skillRuntime.resolveCreateTaskConfig(context);
    if (resolved) {
      return resolved;
    }
    return context !== undefined ? { context } : undefined;
  };

  const runAutomationTask = async (
    automation: AutomationDefinition,
  ): Promise<{ conversationId: string }> => {
    const automationChannels = await resolveAutomationChannels(automation);
    const automationContext = {
      ...(automation.context || {}),
      ...(automationChannels.feishu ? { feishu: automationChannels.feishu } : {}),
      ...(automation.skillIds?.length ? { skillIds: automation.skillIds } : {}),
      automationId: automation.id,
      automationName: automation.name,
      trigger: "automation",
    } as Record<string, unknown>;
    const sourceTaskId =
      typeof automationContext.sourceTaskId === "string"
        ? automationContext.sourceTaskId.trim()
        : "";
    const parentTaskId = resolveExistingAutomationParentId(sourceTaskId);
    const taskConfig = await resolveTaskConfigFromContext(automationContext);
    const automationToolNames = resolveAutomationToolNames(taskConfig?.toolNames);
    const conversation = conversationRepository.create({
      type: "main",
      ...(parentTaskId ? { parentId: parentTaskId } : {}),
      customPrompt: mergeCustomPrompts(taskConfig?.customPrompt, AUTOMATION_EXECUTION_PROMPT),
      toolNames: automationToolNames,
      context: taskConfig?.context,
      autoApproveToolNames: taskConfig?.autoApproveToolNames
        ?.map((name) => name.trim())
        .filter((name) => name && name !== ASK_FOLLOWUP_TOOL_NAME),
    });

    taskOrchestrator.setUserInput(conversation, automation.prompt);

    const onConversationCreate = getGlobalState("onConversationCreate");
    if (onConversationCreate) {
      await onConversationCreate({
        taskId: conversation.id,
        context: conversation.memory.context ?? taskConfig?.context,
      });
    }

    const executor = taskOrchestrator.getExecutor(conversation.id);
    await executor.execute(conversation);
    return { conversationId: conversation.id };
  };

  const automationScheduler = new AutomationScheduler(automationStore, runAutomationTask);
  const feishuBridge = createFeishuBridge({
    cachePath,
    resolveTaskConfig: resolveTaskConfigFromContext,
  });
  const channelRouter = new ConversationChannelRouter([feishuBridge]);
  const autoApproveToolNames = Array.from(
    new Set([
      ...getBaseTools("main").map((tool) => tool.name),
      ...getBaseTools("sub").map((tool) => tool.name),
    ]),
  );
  let builder = new AmigoServerBuilder().port(port).cachePath(cachePath);
  if (options.loggerConfig) {
    builder = builder.loggerConfig(options.loggerConfig);
  }
  if (persistenceProvider) {
    const persistenceAwareBuilder = builder as typeof builder & {
      conversationPersistenceProvider: (provider: unknown) => typeof builder;
    };
    builder = persistenceAwareBuilder.conversationPersistenceProvider(persistenceProvider);
  }
  for (const tool of getUserCodingAgentTools(automationStore, automationScheduler)) {
    builder = builder.registerTool(tool as never);
  }

  const runtimeServer = builder
    .appendSystemPrompt(AMIGO_APP_SYSTEM_PROMPT_APPENDIX)
    .modelConfigs(modelConfigs)
    .userModelConfigResolver(resolveUserScopedModelConfig)
    .sandboxManager(sandboxManager)
    .skills({ provider: skillStore })
    .addAutoApproveTools([
      ...autoApproveToolNames,
      ...builder.toolRegistry.getAll().map((tool) => tool.name),
    ])
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
    feishuBridge,
  });
  const server = new AmigoAppServer({
    port,
    runtimeServer,
    httpHandler,
  });

  await skillStore.init();
  await automationStore.init();
  await feishuBridge.init();
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

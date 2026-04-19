import { existsSync, readFileSync } from "node:fs";
import {
  asyncToolJobRegistry,
  conversationOrchestrator,
  conversationRepository,
  defineTool,
  enqueueConversationContinuation,
  flushConversationContinuationsIfIdle,
  logger,
} from "@amigo-llm/backend";
import type { UserMessageAttachment } from "@amigo-llm/types";
import { resolveDesignDocOwnerTaskId } from "../designDocTools/designDocScope";
import {
  assembleDraftFromLayout,
  assembleDraftFromLayoutProgressive,
  extractLayoutSlotHtml,
  validateModuleDraftHtml,
} from "./assembly";
import { upsertStoredFinalDesignDraft } from "./preview";
import { captureDraftPreviewScreenshot } from "./screenshot";
import {
  type DraftCritique,
  type DraftCritiqueIssue,
  type DraftRenderArtifact,
  type FinalDesignDraft,
  getFinalDraftPreviewHtmlPath,
  type LayoutOption,
  normalizeId,
  toDraftRenderArtifactHttpDetail,
  toModuleDraftHttpDetail,
} from "./shared";
import {
  listStoredModuleDrafts,
  readStoredDesignSession,
  readStoredFinalDesignDraft,
  readStoredLatestDraftCritique,
  readStoredLatestDraftRenderArtifact,
  readStoredLayoutOptions,
  readStoredModuleDraft,
  readStoredThemeOptions,
  upsertStoredModuleDrafts,
  writeStoredDraftAssembly,
  writeStoredLatestDraftCritique,
  writeStoredLatestDraftRenderArtifact,
} from "./storage";

const MODULE_SUBTASK_TOOL_NAMES = [
  "readDesignSession",
  "readLayoutOptions",
  "readThemeOptions",
  "listDesignAssets",
  "readDesignAsset",
  "readModuleDrafts",
  "upsertModuleDrafts",
] as const;

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const normalizeModuleIds = (value: unknown): string[] =>
  readStringArray(value)
    .map((item) => normalizeId(item))
    .filter(Boolean);

const normalizeAssetIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const row = item as Record<string, unknown>;
        return typeof row.assetId === "string" ? row.assetId : "";
      }
      return "";
    })
    .map((item) => normalizeId(item))
    .filter(Boolean);
};

const applyContinuationPrompt = (
  conversation: NonNullable<ReturnType<typeof conversationRepository.load>>,
  prompt: string,
) => {
  conversation.isAborted = false;
  conversation.memory.addMessage({
    role: "system",
    content: prompt,
    type: "system",
    partial: false,
  });
  conversation.userInput = "__amigo_internal_design_orchestration_continuation__";
};

const queueConversationContinuation = (taskId: string, prompt: string, reason: string) => {
  const conversation = conversationRepository.load(taskId);
  if (!conversation || ["completed", "aborted"].includes(conversation.status)) {
    return;
  }

  enqueueConversationContinuation({
    conversation,
    reason,
    run: async (currentConversation) => {
      applyContinuationPrompt(currentConversation, prompt);
      const executor = conversationOrchestrator.getExecutor(currentConversation.id);
      await executor.execute(currentConversation);
    },
    injectBeforeNextTurn: (currentConversation) => {
      applyContinuationPrompt(currentConversation, prompt);
    },
  });
  void flushConversationContinuationsIfIdle(conversation);
};

const requireSelectedDraftDependencies = (ownerTaskId: string) => {
  const session = readStoredDesignSession(ownerTaskId);
  if (!session) {
    throw new Error("请先创建 design session");
  }
  if (!session.selectedLayoutId || !session.selectedThemeId) {
    throw new Error("请先完成布局和主题选择，再启动模块编排");
  }

  const layout = readStoredLayoutOptions(ownerTaskId).find(
    (item) => item.layoutId === session.selectedLayoutId,
  );
  const theme = readStoredThemeOptions(ownerTaskId).find(
    (item) => item.themeId === session.selectedThemeId,
  );
  if (!layout) {
    throw new Error(`未找到已选布局 ${session.selectedLayoutId}`);
  }
  if (!theme) {
    throw new Error(`未找到已选主题 ${session.selectedThemeId}`);
  }

  return { session, layout, theme };
};

const buildOverallDraftEffectSummary = (params: {
  pageGoal: string;
  targetAudience: string;
  brandMood: string;
  layoutTitle: string;
  themeTitle: string;
  modules: string[];
}) =>
  `当 ${params.modules.join("、")} 装配成完整页面后，整体应围绕“${params.pageGoal}”形成统一的首屏重心和节奏明确的浏览路径，让 ${params.targetAudience} 感受到 ${params.brandMood} 的品牌气质；结构上严格继承 ${params.layoutTitle}，视觉上统一服从 ${params.themeTitle}，不能让各模块像独立卡片临时拼接。`;

const buildVisualDetailChecklist = () =>
  "务必主动设计并统一背景层次、区块过渡、留白节奏、阴影强弱、边框透明度、圆角体系、字体选择、字号级差、字重对比、按钮皮肤、图片/图标风格与局部高光，而不是只把内容块摆到位。";

const buildModuleImplementationTasks = (params: {
  draftId: string;
  modules: Array<{ id: string; label: string; summary: string; priority: string }>;
  layout: LayoutOption;
  theme: { title: string; tokens: Record<string, string> };
  session: {
    pageGoal: string;
    targetAudience: string;
    brandMood: string;
    styleKeywords: string[];
    constraints: string[];
    antiGoals: string[];
  };
  iterationGoal?: string;
  revisionFeedbackByModuleId?: Record<string, string[]>;
}) => {
  const tools = MODULE_SUBTASK_TOOL_NAMES.join(", ");
  const overallEffect = buildOverallDraftEffectSummary({
    pageGoal: params.session.pageGoal,
    targetAudience: params.session.targetAudience,
    brandMood: params.session.brandMood,
    layoutTitle: params.layout.title,
    themeTitle: params.theme.title,
    modules: params.modules.map((module) => module.label),
  });
  const detailChecklist = buildVisualDetailChecklist();
  return params.modules.map((module, index) => {
    const slotHtml = extractLayoutSlotHtml(params.layout.source, module.id);
    if (!slotHtml) {
      throw new Error(`布局 ${params.layout.layoutId} 中缺少模块槽位 ${module.id}`);
    }
    const feedback = params.revisionFeedbackByModuleId?.[module.id] || [];
    const feedbackText = feedback.length > 0 ? ` 返工重点：${feedback.join("；")}` : "";
    const themeTokenText = Object.entries(params.theme.tokens)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ");
    return {
      id: `1.${index + 1}`,
      title:
        `生成模块 ${module.label}（${module.id}）的最终设计稿并写回 draftId="${params.draftId}" 的 module draft。` +
        `必须先读取 design session / layout / theme，并严格依据槽位 HTML、主题 tokens、设计约束与协作协议实现。` +
        `模块职责：${module.summary || "无"}。模块优先级：${module.priority}。` +
        `iterationGoal：${params.iterationGoal || "无"}。` +
        `槽位 HTML：${slotHtml.replace(/\s+/g, " ").trim()}。` +
        `主题 tokens：${themeTokenText || "无"}。` +
        `根节点保留 data-module-id="${module.id}"，只处理当前模块，不要重排整页。` +
        `整页合体目标：${overallEffect} 细节要求：${detailChecklist}` +
        `${feedbackText} [tools: ${tools}]`,
      deps: [],
    };
  });
};

const readTaskListStatus = (taskId: string): { content: string; hasPending: boolean } => {
  const conversation = conversationRepository.get(taskId) || conversationRepository.load(taskId);
  const filePath = conversation?.memory.storagePath
    ? `${conversation.memory.storagePath}/taskList.md`
    : "";
  if (!filePath) {
    return { content: "", hasPending: false };
  }

  if (!existsSync(filePath)) {
    return { content: "", hasPending: false };
  }

  const content = readFileSync(filePath, "utf-8");
  return {
    content,
    hasPending: /^\s*-\s+\[\s\]\s+/m.test(content),
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const broadcastTaskExecutionState = (taskId: string) => {
  const conversation = conversationRepository.get(taskId) || conversationRepository.load(taskId);
  if (!conversation) {
    return;
  }
  conversation.broadcastTaskStatusMapUpdated();
};

const parseCritiqueIssues = (value: unknown): DraftCritiqueIssue[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const row = item as Record<string, unknown>;
      return {
        scope: row.scope === "module" ? "module" : "global",
        moduleId: typeof row.moduleId === "string" ? normalizeId(row.moduleId) : null,
        severity: row.severity === "high" || row.severity === "medium" ? row.severity : "low",
        title: typeof row.title === "string" ? row.title.trim() : "未命名问题",
        detail: typeof row.detail === "string" ? row.detail.trim() : "",
        recommendation: typeof row.recommendation === "string" ? row.recommendation.trim() : "",
      } satisfies DraftCritiqueIssue;
    })
    .filter((item): item is DraftCritiqueIssue => Boolean(item));
};

const parseCritiqueFromResult = (
  draftId: string,
  revision: number,
  result: string,
): DraftCritique => {
  const jsonMatch = result.match(/```json\s*([\s\S]*?)```/i);
  if (!jsonMatch?.[1]) {
    return {
      draftId,
      revision,
      summary: "已完成文本评审，但未产出结构化 critique。",
      autoFixedModuleIds: [],
      issues: [],
      createdAt: new Date().toISOString(),
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
    return {
      draftId,
      revision,
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : "已完成结构化评审",
      autoFixedModuleIds: normalizeModuleIds(parsed.autoFixedModuleIds),
      issues: parseCritiqueIssues(parsed.issues),
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      draftId,
      revision,
      summary: `结构化 critique 解析失败: ${error instanceof Error ? error.message : String(error)}`,
      autoFixedModuleIds: [],
      issues: [],
      createdAt: new Date().toISOString(),
    };
  }
};

const buildCritiquePrompt = (params: {
  draft: FinalDesignDraft;
  layout: LayoutOption;
  themeTitle: string;
  themeTokens: Record<string, string>;
  sessionSummary: string;
  screenshotMode: string;
}) => {
  const themeTokenLines = Object.entries(params.themeTokens)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  return `你是设计评审代理。请审查这个最终设计稿，并输出结构化 critique。

输入上下文：
- draftId: ${params.draft.draftId}
- revision: ${params.draft.revision}
- 页面摘要: ${params.sessionSummary}
- 布局: ${params.layout.title}
- 主题: ${params.themeTitle}
- 截图模式: ${params.screenshotMode}

主题 tokens：
${themeTokenLines}

如果本条消息附带了图片，请优先基于图片评审；如果没有图片，则退回基于 HTML 和布局/主题摘要评审。

你必须调用 finishPhase，并在 result 的 "## 交付物" 小节里输出一个 JSON code block，结构严格如下：
\`\`\`json
{
  "summary": "整体评审摘要",
  "issues": [
    {
      "scope": "global 或 module",
      "moduleId": "如果是 module 问题则填写模块 ID，否则为 null",
      "severity": "low 或 medium 或 high",
      "title": "短标题",
      "detail": "问题说明",
      "recommendation": "修改建议"
    }
  ]
}
\`\`\`

要求：
1. 只指出具体视觉问题，不讨论实现细节。
2. 只有真正属于某个模块内部的问题，才标记为 module。
3. 跨模块节奏、层级、整体重心、背景系统等问题必须标记为 global。
4. 最多返回 6 个 issues，按重要性排序。`;
};

const createImageAttachment = (
  render: DraftRenderArtifact,
  draftId: string,
): UserMessageAttachment[] => {
  if (!render.publicImageUrl) {
    return [];
  }

  return [
    {
      id: `${draftId}-render-${render.revision}`,
      name: `${draftId}-rev-${render.revision}.png`,
      mimeType: "image/png",
      size: 0,
      kind: "image",
      url: render.publicImageUrl,
    },
  ];
};

const generateModuleDrafts = async (params: {
  currentTaskId: string;
  ownerTaskId: string;
  draftId: string;
  iterationGoal?: string;
  modules: Array<{ id: string; label: string; summary: string; priority: string }>;
  layout: LayoutOption;
  theme: { themeId: string; title: string; tokens: Record<string, string> };
  session: {
    pageGoal: string;
    targetAudience: string;
    brandMood: string;
    styleKeywords: string[];
    constraints: string[];
    antiGoals: string[];
  };
  getToolByName: (name: string) => any;
  revisionFeedbackByModuleId?: Record<string, string[]>;
}) => {
  for (const module of params.modules) {
    const slotHtml = extractLayoutSlotHtml(params.layout.source, module.id);
    if (!slotHtml) {
      throw new Error(`布局 ${params.layout.layoutId} 中缺少模块槽位 ${module.id}`);
    }
  }

  const beforeMap = new Map(
    params.modules.map((module) => [
      module.id,
      readStoredModuleDraft(params.ownerTaskId, params.draftId, module.id)?.updatedAt || null,
    ]),
  );
  const taskListTasks = buildModuleImplementationTasks({
    draftId: params.draftId,
    modules: params.modules,
    session: params.session,
    layout: params.layout,
    theme: params.theme,
    iterationGoal: params.iterationGoal,
    revisionFeedbackByModuleId: params.revisionFeedbackByModuleId,
  });
  const taskListTool = params.getToolByName("taskList");
  if (!taskListTool) {
    throw new Error("缺少 taskList 工具，无法执行模块实施任务");
  }

  const toolContext = {
    taskId: params.currentTaskId,
    parentId: undefined,
    getSandbox: async () => ({}),
    getToolByName: params.getToolByName,
    signal: undefined,
  };

  await taskListTool.invoke({
    params: { action: "execute", tasks: taskListTasks },
    context: toolContext,
  });
  broadcastTaskExecutionState(params.currentTaskId);

  const startedAt = Date.now();
  while (Date.now() - startedAt < 30 * 60 * 1000) {
    const { content, hasPending } = readTaskListStatus(params.currentTaskId);
    if (content) {
      broadcastTaskExecutionState(params.currentTaskId);
    }

    const currentConversation =
      conversationRepository.get(params.currentTaskId) ||
      conversationRepository.load(params.currentTaskId);
    const hasBlockingExecutionTasks = Object.values(
      currentConversation?.memory.executionTasks || {},
    ).some((status) => status.status === "failed");
    if (hasBlockingExecutionTasks) {
      throw new Error("模块 execution 执行未全部完成，存在失败任务");
    }

    const moduleDraftCount = params.modules.filter((module) =>
      readStoredModuleDraft(params.ownerTaskId, params.draftId, module.id),
    ).length;
    if (!hasPending && moduleDraftCount >= params.modules.length) {
      break;
    }

    await sleep(1000);
  }

  for (const module of params.modules) {
    const nextDraft = readStoredModuleDraft(params.ownerTaskId, params.draftId, module.id);
    if (!nextDraft) {
      throw new Error(`模块 ${module.id} 未写入 module draft`);
    }
    const previousUpdatedAt = beforeMap.get(module.id);
    if (previousUpdatedAt && nextDraft.updatedAt === previousUpdatedAt) {
      throw new Error(`模块 ${module.id} 未产生新的 module draft 版本`);
    }

    const validationErrors = validateModuleDraftHtml(module.id, nextDraft.html);
    if (validationErrors.length > 0) {
      throw new Error(`${module.id}: ${validationErrors[0]}`);
    }
  }
};

const assembleAndPersistDraft = async (params: {
  ownerTaskId: string;
  draftId: string;
  title: string;
  layout: LayoutOption;
  themeId: string;
}) => {
  const moduleDrafts = listStoredModuleDrafts(params.ownerTaskId, params.draftId);
  const moduleHtmlById = Object.fromEntries(moduleDrafts.map((item) => [item.moduleId, item.html]));
  const assembled = assembleDraftFromLayout(params.layout.source, moduleHtmlById);
  const draft = await upsertStoredFinalDesignDraft(params.ownerTaskId, {
    draftId: params.draftId,
    title: params.title,
    content: assembled.content,
    basedOnLayoutId: params.layout.layoutId,
    basedOnThemeId: params.themeId,
  });

  writeStoredDraftAssembly(params.ownerTaskId, {
    draftId: params.draftId,
    basedOnLayoutId: params.layout.layoutId,
    basedOnThemeId: params.themeId,
    moduleOrder: assembled.moduleOrder,
    assembledHtml: assembled.content,
    revision: draft.revision,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  });

  return draft;
};

const runDraftCritique = async (params: {
  currentTaskId: string;
  draft: FinalDesignDraft;
  layout: LayoutOption;
  theme: { title: string; tokens: Record<string, string> };
  sessionSummary: string;
  render: DraftRenderArtifact;
}) => {
  const attachments = createImageAttachment(params.render, params.draft.draftId);
  const subPrompt = buildCritiquePrompt({
    draft: params.draft,
    layout: params.layout,
    themeTitle: params.theme.title,
    themeTokens: params.theme.tokens,
    sessionSummary: params.sessionSummary,
    screenshotMode: attachments.length > 0 ? "image+text" : "text-only",
  });
  const result = await conversationOrchestrator.runExecutionTask({
    subPrompt,
    target: `评审最终设计稿 ${params.draft.draftId} rev ${params.draft.revision}`,
    parentId: params.currentTaskId,
    tools: [],
    attachments,
    taskDescription: `design-critic:${params.draft.draftId}:rev-${params.draft.revision}`,
  });
  return parseCritiqueFromResult(params.draft.draftId, params.draft.revision, result.result);
};

const orchestrateDraft = async (params: {
  currentTaskId: string;
  ownerTaskId: string;
  draftId: string;
  title: string;
  iterationGoal?: string;
  regenerateModules: string[];
  getToolByName: (name: string) => any;
}) => {
  const { session, layout, theme } = requireSelectedDraftDependencies(params.ownerTaskId);
  const existingModuleDrafts = listStoredModuleDrafts(params.ownerTaskId, params.draftId);
  const moduleIdsToGenerate =
    params.regenerateModules.length > 0
      ? params.regenerateModules
      : existingModuleDrafts.length === 0
        ? session.modules.map((module) => module.id)
        : session.modules
            .map((module) => module.id)
            .filter((moduleId) => !existingModuleDrafts.some((item) => item.moduleId === moduleId));

  const firstPassModules = session.modules.filter((module) =>
    moduleIdsToGenerate.includes(module.id),
  );
  if (firstPassModules.length > 0) {
    await generateModuleDrafts({
      currentTaskId: params.currentTaskId,
      ownerTaskId: params.ownerTaskId,
      draftId: params.draftId,
      iterationGoal: params.iterationGoal,
      modules: firstPassModules,
      layout,
      theme,
      session,
      getToolByName: params.getToolByName,
    });
  }

  let draft = await assembleAndPersistDraft({
    ownerTaskId: params.ownerTaskId,
    draftId: params.draftId,
    title: params.title,
    layout,
    themeId: theme.themeId,
  });
  let render = await captureDraftPreviewScreenshot({
    taskId: params.ownerTaskId,
    draftId: params.draftId,
    revision: draft.revision,
    previewHtmlPath: getFinalDraftPreviewHtmlPath(params.ownerTaskId, params.draftId),
    deviceMode: layout.canvasWidth < 768 ? "mobile" : "desktop",
  });
  writeStoredLatestDraftRenderArtifact(params.ownerTaskId, render);

  const sessionSummary = [
    `页面目标：${session.pageGoal}`,
    `目标用户：${session.targetAudience}`,
    `品牌气质：${session.brandMood}`,
    `模块：${session.modules.map((item) => `${item.label}(${item.id})`).join(", ")}`,
  ].join("\n");
  let critique = await runDraftCritique({
    currentTaskId: params.currentTaskId,
    draft,
    layout,
    theme,
    sessionSummary,
    render,
  });

  const autoFixModuleIds = Array.from(
    new Set(
      critique.issues
        .filter((issue) => issue.scope === "module" && issue.moduleId)
        .map((issue) => issue.moduleId as string),
    ),
  );

  if (autoFixModuleIds.length > 0) {
    const feedbackByModuleId = autoFixModuleIds.reduce<Record<string, string[]>>(
      (acc, moduleId) => {
        acc[moduleId] = critique.issues
          .filter((issue) => issue.scope === "module" && issue.moduleId === moduleId)
          .map((issue) => `${issue.title}: ${issue.detail}；建议：${issue.recommendation}`);
        return acc;
      },
      {},
    );

    await generateModuleDrafts({
      currentTaskId: params.currentTaskId,
      ownerTaskId: params.ownerTaskId,
      draftId: params.draftId,
      iterationGoal: params.iterationGoal,
      modules: session.modules.filter((module) => autoFixModuleIds.includes(module.id)),
      layout,
      theme,
      session,
      getToolByName: params.getToolByName,
      revisionFeedbackByModuleId: feedbackByModuleId,
    });

    draft = await assembleAndPersistDraft({
      ownerTaskId: params.ownerTaskId,
      draftId: params.draftId,
      title: params.title,
      layout,
      themeId: theme.themeId,
    });
    render = await captureDraftPreviewScreenshot({
      taskId: params.ownerTaskId,
      draftId: params.draftId,
      revision: draft.revision,
      previewHtmlPath: getFinalDraftPreviewHtmlPath(params.ownerTaskId, params.draftId),
      deviceMode: layout.canvasWidth < 768 ? "mobile" : "desktop",
    });
    writeStoredLatestDraftRenderArtifact(params.ownerTaskId, render);
    critique = await runDraftCritique({
      currentTaskId: params.currentTaskId,
      draft,
      layout,
      theme,
      sessionSummary,
      render,
    });
    critique.autoFixedModuleIds = autoFixModuleIds;
  }

  writeStoredLatestDraftCritique(params.ownerTaskId, critique);
};

export const readModuleDraftsTool = defineTool({
  name: "readModuleDrafts",
  description: "读取某个最终设计稿下的模块草稿列表。",
  whenToUse: "需要查看模块级设计稿的当前状态、文案摘要和最后更新时间时使用。",
  params: [{ name: "draftId", optional: false, description: "最终草稿 ID" }],
  async invoke({ params, context }) {
    const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
    const draftId = typeof params.draftId === "string" ? normalizeId(params.draftId) : "";
    if (!ownerTaskId || !draftId) {
      const message = "draftId 不能为空";
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          taskId: ownerTaskId || "",
          draftId,
          modules: [],
          latestRevision: null,
          validationErrors: [message],
          message,
        },
      };
    }

    const modules = listStoredModuleDrafts(ownerTaskId, draftId);
    const latestRevision = readStoredFinalDesignDraft(ownerTaskId, draftId)?.revision ?? null;
    return {
      message: modules.length > 0 ? `已读取 ${modules.length} 个模块草稿` : "当前还没有模块草稿",
      toolResult: {
        success: true,
        taskId: ownerTaskId,
        draftId,
        modules: modules.map((module) => toModuleDraftHttpDetail(ownerTaskId, module)),
        latestRevision,
        validationErrors: [],
        message: modules.length > 0 ? `已读取 ${modules.length} 个模块草稿` : "当前还没有模块草稿",
      },
    };
  },
});

export const upsertModuleDraftsTool = defineTool({
  name: "upsertModuleDrafts",
  description: "写入某个最终设计稿下的模块级 HTML 草稿。",
  whenToUse: "模块 executionTask 完成当前模块视觉稿后，必须调用该工具写回模块草稿。",
  params: [
    { name: "draftId", optional: false, description: "最终草稿 ID" },
    {
      name: "modules",
      optional: false,
      type: "array",
      description: "要写入的模块草稿列表",
      params: [
        {
          name: "module",
          optional: false,
          type: "object",
          description: "单个模块草稿",
          params: [
            { name: "moduleId", optional: false, description: "模块 ID" },
            { name: "title", optional: false, description: "模块标题" },
            { name: "html", optional: false, description: "模块 HTML 片段" },
            { name: "notes", optional: true, description: "模块备注" },
            {
              name: "assetsUsed",
              optional: true,
              type: "array",
              description: "使用过的设计资产 ID",
              params: [{ name: "assetId", optional: false, description: "资产 ID" }],
            },
            { name: "copySummary", optional: true, description: "文案摘要" },
            {
              name: "status",
              optional: true,
              description: "模块状态，可选 draft / revised / accepted",
            },
          ],
        },
      ],
    },
  ],
  async invoke({ params, context }) {
    const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
    const draftId = typeof params.draftId === "string" ? normalizeId(params.draftId) : "";
    if (!ownerTaskId || !draftId) {
      const message = "draftId 不能为空";
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          taskId: ownerTaskId || "",
          draftId,
          modules: [],
          latestRevision: null,
          validationErrors: [message],
          message,
        },
      };
    }

    const inputs = Array.isArray(params.modules)
      ? params.modules
          .map((item) =>
            item && typeof item === "object" ? (item as Record<string, unknown>) : null,
          )
          .filter((item): item is Record<string, unknown> => Boolean(item))
      : [];
    const validationErrors: string[] = [];
    const preparedInputs = inputs
      .map((item, index) => {
        const moduleId = typeof item.moduleId === "string" ? normalizeId(item.moduleId) : "";
        const title = typeof item.title === "string" ? item.title.trim() : "";
        const html = typeof item.html === "string" ? item.html : "";
        const errors = [
          !moduleId ? "moduleId 不能为空" : "",
          !title ? "title 不能为空" : "",
          ...validateModuleDraftHtml(moduleId, html),
        ].filter(Boolean);
        validationErrors.push(...errors.map((error) => `modules[${index}]: ${error}`));
        if (!moduleId || !title || errors.length > 0) {
          return null;
        }

        return {
          moduleId,
          title,
          html,
          notes: typeof item.notes === "string" ? item.notes : null,
          assetsUsed: normalizeAssetIds(item.assetsUsed),
          copySummary: typeof item.copySummary === "string" ? item.copySummary : "",
          status: item.status === "accepted" || item.status === "revised" ? item.status : "draft",
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    if (preparedInputs.length === 0) {
      const message = validationErrors[0] || "没有可写入的模块草稿";
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          taskId: ownerTaskId || "",
          draftId,
          modules: [],
          latestRevision: null,
          validationErrors,
          message,
        },
      };
    }

    const modules = upsertStoredModuleDrafts(ownerTaskId, draftId, preparedInputs);
    let latestRevision = readStoredFinalDesignDraft(ownerTaskId, draftId)?.revision ?? null;
    let message = `已更新 ${modules.length} 个模块草稿`;

    const session = readStoredDesignSession(ownerTaskId);
    if (session?.selectedLayoutId && session.selectedThemeId) {
      const layout = readStoredLayoutOptions(ownerTaskId).find(
        (item) => item.layoutId === session.selectedLayoutId,
      );
      const theme = readStoredThemeOptions(ownerTaskId).find(
        (item) => item.themeId === session.selectedThemeId,
      );

      if (layout && theme) {
        const allModuleDrafts = listStoredModuleDrafts(ownerTaskId, draftId);
        const moduleHtmlById = Object.fromEntries(
          allModuleDrafts.map((module) => [module.moduleId, module.html]),
        );
        const assembled = assembleDraftFromLayoutProgressive(layout.source, moduleHtmlById);
        const draft = await upsertStoredFinalDesignDraft(ownerTaskId, {
          draftId,
          title: readStoredFinalDesignDraft(ownerTaskId, draftId)?.title || draftId,
          content: assembled.content,
          basedOnLayoutId: layout.layoutId,
          basedOnThemeId: theme.themeId,
        });

        writeStoredDraftAssembly(ownerTaskId, {
          draftId,
          basedOnLayoutId: layout.layoutId,
          basedOnThemeId: theme.themeId,
          moduleOrder: assembled.moduleOrder,
          assembledHtml: assembled.content,
          revision: draft.revision,
          createdAt: draft.createdAt,
          updatedAt: draft.updatedAt,
        });

        latestRevision = draft.revision;
        message = `已更新 ${modules.length} 个模块草稿，并同步装配整页预览 rev ${draft.revision}`;
      }
    }

    return {
      message,
      toolResult: {
        success: true,
        taskId: ownerTaskId,
        draftId,
        modules: modules.map((module) => toModuleDraftHttpDetail(ownerTaskId, module)),
        latestRevision,
        validationErrors,
        message,
      },
    };
  },
});

export const readDraftCritiqueTool = defineTool({
  name: "readDraftCritique",
  description: "读取某个最终设计稿的最新评审结果和截图信息。",
  whenToUse:
    "仅在 final draft 已经装配完成后，用于查看最新视觉评审摘要、问题列表和截图 artifact。不要在 final draft 尚未生成时用它做主状态轮询；应先读取 readFinalDesignDraft 或先确保 orchestrateFinalDesignDraft 已执行。",
  params: [{ name: "draftId", optional: false, description: "最终草稿 ID" }],
  async invoke({ params, context }) {
    const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
    const draftId = typeof params.draftId === "string" ? normalizeId(params.draftId) : "";
    if (!ownerTaskId || !draftId) {
      const message = "draftId 不能为空";
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          taskId: ownerTaskId || "",
          draftId,
          critique: null,
          render: null,
          validationErrors: [message],
          message,
        },
      };
    }

    const critique = readStoredLatestDraftCritique(ownerTaskId, draftId);
    const render = readStoredLatestDraftRenderArtifact(ownerTaskId, draftId);
    return {
      message: critique ? `已读取草稿 ${draftId} 的最新评审` : "当前还没有评审结果",
      toolResult: {
        success: true,
        taskId: ownerTaskId,
        draftId,
        critique,
        render: render ? toDraftRenderArtifactHttpDetail(ownerTaskId, render) : null,
        validationErrors: [],
        message: critique ? `已读取草稿 ${draftId} 的最新评审` : "当前还没有评审结果",
      },
    };
  },
});

export const orchestrateFinalDesignDraftTool = defineTool({
  name: "orchestrateFinalDesignDraft",
  description:
    "启动最终设计稿的默认生成流程。它会直接生成并执行模块实施 taskList，驱动模块子任务完成设计稿，最后装配成 1 个最终界面草稿，并自动截图与评审。",
  whenToUse:
    "布局与主题都已确认后，默认立即使用该工具生成最终设计稿。session / layout / theme 阶段仍由主流程直接处理，不需要拆 executionTask；只有最终稿的模块级实施、返工、拼装和 critique 才进入这里。该工具会启动一个设计实施管理子任务，由它直接生成并执行模块 taskList，把背景、精细布局、图片/图标、字体、阴影等设计决策下发给模块子任务，最后再回到父流程装配整页并做 critique。该工具一旦返回 started / already_running，就说明后台已接管；本轮必须立即停止，不要继续读取状态、不要轮询、不要再查 readFinalDesignDraft / readDraftCritique。",
  completionBehavior: "idle",
  params: [
    { name: "draftId", optional: false, description: "最终草稿 ID" },
    { name: "title", optional: false, description: "最终草稿标题" },
    { name: "iterationGoal", optional: true, description: "本轮生成或返工目标" },
    {
      name: "regenerateModules",
      optional: true,
      type: "array",
      description: "需要重新生成的模块 ID 列表；为空时自动补齐缺失模块。",
      params: [{ name: "moduleId", optional: false, description: "模块 ID" }],
    },
  ],
  async invoke({ params, context }) {
    const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
    const draftId = typeof params.draftId === "string" ? normalizeId(params.draftId) : "";
    const title = typeof params.title === "string" ? params.title.trim() : "";
    if (!ownerTaskId || !draftId || !title) {
      const message = !draftId ? "draftId 不能为空" : "title 不能为空";
      return {
        message,
        error: message,
        toolResult: {
          success: false,
          taskId: ownerTaskId || "",
          draftId,
          title,
          async: false,
          status: "started" as const,
          executionId: "",
          startedAt: new Date().toISOString(),
          validationErrors: [message],
          message,
        },
      };
    }

    const regenerateModules = normalizeModuleIds(params.regenerateModules);
    const { job, started } = asyncToolJobRegistry.startOrJoin({
      key: `orchestrateFinalDesignDraft:${context.taskId}:${draftId}`,
      toolName: "orchestrateFinalDesignDraft",
      taskId: context.taskId,
      run: async () => {
        try {
          await orchestrateDraft({
            currentTaskId: context.taskId,
            ownerTaskId,
            draftId,
            title,
            iterationGoal:
              typeof params.iterationGoal === "string" ? params.iterationGoal.trim() : "",
            regenerateModules,
            getToolByName: context.getToolByName,
          });
          queueConversationContinuation(
            context.taskId,
            `design orchestration 已完成。请先调用 designDraft，参数 action="read", draftId="${draftId}"，确认整页草稿已经装配成功；只有在 draft 存在后，再调用 designDraft，参数 action="critique", draftId="${draftId}" 读取整页评审结果，然后继续向用户汇报。`,
            `design orchestration 完成 ${draftId}`,
          );
        } catch (error) {
          logger.error("[DesignDraft] orchestrateFinalDesignDraft 失败", error);
          queueConversationContinuation(
            context.taskId,
            `design orchestration 失败：${error instanceof Error ? error.message : String(error)}。请阅读错误并继续处理。`,
            `design orchestration 失败 ${draftId}`,
          );
          throw error;
        }
      },
    });

    const message = started
      ? `已启动最终设计稿编排（执行编号: ${job.id}）。后台正在设计中；现在应立即告知用户后台已开始执行，并结束本轮，不要继续读取状态。`
      : `最终设计稿编排已在执行中（执行编号: ${job.id}）。后台仍在设计中；现在应立即告知用户后台仍在执行，并结束本轮，不要继续读取状态。`;
    return {
      message,
      toolResult: {
        success: true,
        taskId: ownerTaskId,
        draftId,
        title,
        async: true,
        status: started ? "started" : "already_running",
        executionId: job.id,
        startedAt: job.startedAt,
        validationErrors: [],
        message,
      },
    };
  },
});

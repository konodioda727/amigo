import type { AutomationScheduler } from "../../automations/automationScheduler";
import type { AutomationStore } from "../../automations/automationStore";
import { createUpsertAutomationTool } from "../automationTools/upsertAutomationTool";
import {
  designDraftTool,
  designOptionsTool,
  designSessionTool,
  orchestrateFinalDesignDraftTool,
  readDesignSessionTool,
  readDraftCritiqueTool,
  readFinalDesignDraftTool,
  readLayoutOptionsTool,
  readModuleDraftsTool,
  readThemeOptionsTool,
  upsertDesignSessionTool,
  upsertLayoutOptionsTool,
  upsertModuleDraftsTool,
  upsertThemeOptionsTool,
} from "../designDraftTools";
import { readRepoKnowledgeTool, upsertRepoKnowledgeTool } from "../repoKnowledgeTools";
import { LANGUAGE_INTELLIGENCE_TOOLS } from "./languageIntelligenceTools";

const INTERNAL_DESIGN_TOOLS = [
  readDesignSessionTool,
  upsertDesignSessionTool,
  readLayoutOptionsTool,
  upsertLayoutOptionsTool,
  readThemeOptionsTool,
  upsertThemeOptionsTool,
  orchestrateFinalDesignDraftTool,
  readDraftCritiqueTool,
  readFinalDesignDraftTool,
  readModuleDraftsTool,
  upsertModuleDraftsTool,
] as const;

export const REPO_KNOWLEDGE_TOOL_NAMES = ["readRepoKnowledge", "upsertRepoKnowledge"] as const;

export const getUserCodingAgentVisibleToolNames = (options?: {
  enableLanguageIntelligence?: boolean;
}) => [
  ...REPO_KNOWLEDGE_TOOL_NAMES,
  "designSession",
  "designOptions",
  "designDraft",
  ...(options?.enableLanguageIntelligence
    ? LANGUAGE_INTELLIGENCE_TOOLS.map((tool) => tool.name)
    : []),
  "upsertAutomation",
];

export const getUserCodingAgentTools = (
  automationStore: AutomationStore,
  automationScheduler: AutomationScheduler,
  options?: { enableLanguageIntelligence?: boolean },
) => [
  readRepoKnowledgeTool,
  upsertRepoKnowledgeTool,
  designSessionTool,
  designOptionsTool,
  designDraftTool,
  ...INTERNAL_DESIGN_TOOLS,
  ...(options?.enableLanguageIntelligence ? LANGUAGE_INTELLIGENCE_TOOLS : []),
  createUpsertAutomationTool(automationStore, automationScheduler),
];

export const USER_CODING_AGENT_AUTO_APPROVE_TOOLS = [
  "readRepoKnowledge",
  "upsertRepoKnowledge",
  "designSession",
  "designOptions",
  "designDraft",
  "readDesignSession",
  "upsertDesignSession",
  "readLayoutOptions",
  "upsertLayoutOptions",
  "readThemeOptions",
  "upsertThemeOptions",
  "orchestrateFinalDesignDraft",
  "readDraftCritique",
  "readFinalDesignDraft",
  "readModuleDrafts",
  "upsertModuleDrafts",
  "goToDefinition",
  "findReferences",
  "getDiagnostics",
  "upsertAutomation",
] as const;

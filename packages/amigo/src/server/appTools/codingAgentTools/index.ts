import { runChecksTool } from "@amigo-llm/backend";
import type { AutomationScheduler } from "../../automations/automationScheduler";
import type { AutomationStore } from "../../automations/automationStore";
import { createUpsertAutomationTool } from "../automationTools/upsertAutomationTool";
import {
  orchestrateFinalDesignDraftTool,
  readDesignSessionTool,
  readDraftCritiqueTool,
  readFinalDesignDraftTool,
  readLayoutOptionsTool,
  readThemeOptionsTool,
  upsertDesignSessionTool,
  upsertLayoutOptionsTool,
  upsertThemeOptionsTool,
} from "../designDraftTools";
import { LANGUAGE_INTELLIGENCE_TOOLS } from "./languageIntelligenceTools";

export const getUserCodingAgentTools = (
  automationStore: AutomationStore,
  automationScheduler: AutomationScheduler,
  options?: { enableLanguageIntelligence?: boolean },
) => [
  runChecksTool,
  readDesignSessionTool,
  upsertDesignSessionTool,
  readLayoutOptionsTool,
  upsertLayoutOptionsTool,
  readThemeOptionsTool,
  upsertThemeOptionsTool,
  orchestrateFinalDesignDraftTool,
  readDraftCritiqueTool,
  readFinalDesignDraftTool,
  ...(options?.enableLanguageIntelligence ? LANGUAGE_INTELLIGENCE_TOOLS : []),
  createUpsertAutomationTool(automationStore, automationScheduler),
];

export const USER_CODING_AGENT_AUTO_APPROVE_TOOLS = [
  "runChecks",
  "readDesignSession",
  "upsertDesignSession",
  "readLayoutOptions",
  "upsertLayoutOptions",
  "readThemeOptions",
  "upsertThemeOptions",
  "orchestrateFinalDesignDraft",
  "readDraftCritique",
  "readFinalDesignDraft",
  "goToDefinition",
  "findReferences",
  "getDiagnostics",
  "upsertAutomation",
] as const;

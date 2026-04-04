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

export const getUserCodingAgentTools = (
  automationStore: AutomationStore,
  automationScheduler: AutomationScheduler,
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
  "upsertAutomation",
] as const;

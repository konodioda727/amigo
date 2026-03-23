import { runChecksTool } from "@amigo-llm/backend";
import type { AutomationScheduler } from "../../automations/automationScheduler";
import type { AutomationStore } from "../../automations/automationStore";
import { createUpsertAutomationTool } from "../automationTools/upsertAutomationTool";
import { listDesignAssetsTool, readDesignAssetTool } from "../designDocTools/designAssets";
import {
  createDesignDocFromMarkupTool,
  listDesignDocsTool,
  readDesignDocTool,
  replaceDesignSectionFromMarkupTool,
} from "../designDocTools/designDocs";

export const getUserCodingAgentTools = (
  automationStore: AutomationStore,
  automationScheduler: AutomationScheduler,
) => [
  runChecksTool,
  listDesignAssetsTool,
  readDesignAssetTool,
  listDesignDocsTool,
  readDesignDocTool,
  createDesignDocFromMarkupTool,
  replaceDesignSectionFromMarkupTool,
  createUpsertAutomationTool(automationStore, automationScheduler),
];

export const USER_CODING_AGENT_AUTO_APPROVE_TOOLS = [
  "runChecks",
  "listDesignAssets",
  "readDesignAsset",
  "listDesignDocs",
  "readDesignDoc",
  "createDesignDocFromMarkup",
  "replaceDesignSectionFromMarkup",
  "upsertAutomation",
] as const;

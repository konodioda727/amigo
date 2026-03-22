import { repoSearchTool, runChecksTool } from "@amigo-llm/backend";
import type { AutomationStore } from "../../automations/automationStore";
import { createUpsertAutomationTool } from "../automationTools/upsertAutomationTool";
import { listDesignAssetsTool, readDesignAssetTool } from "../designDocTools/designAssets";
import {
  createDesignDocFromMarkupTool,
  listDesignDocsTool,
  readDesignDocTool,
  replaceDesignSectionFromMarkupTool,
} from "../designDocTools/designDocs";

export const getUserCodingAgentTools = (automationStore: AutomationStore) => [
  repoSearchTool,
  runChecksTool,
  listDesignAssetsTool,
  readDesignAssetTool,
  listDesignDocsTool,
  readDesignDocTool,
  createDesignDocFromMarkupTool,
  replaceDesignSectionFromMarkupTool,
  createUpsertAutomationTool(automationStore),
];

export const USER_CODING_AGENT_AUTO_APPROVE_TOOLS = [
  "repoSearch",
  "runChecks",
  "listDesignAssets",
  "readDesignAsset",
  "listDesignDocs",
  "readDesignDoc",
  "createDesignDocFromMarkup",
  "replaceDesignSectionFromMarkup",
  "upsertAutomation",
] as const;

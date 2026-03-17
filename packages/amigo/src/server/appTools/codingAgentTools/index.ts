import { repoSearchTool, runChecksTool } from "@amigo-llm/backend";
import { listDesignAssetsTool, readDesignAssetTool } from "../designDocTools/designAssets";
import {
  createDesignDocFromMarkupTool,
  listDesignDocsTool,
  readDesignDocTool,
  replaceDesignSectionFromMarkupTool,
} from "../designDocTools/designDocs";

export const USER_CODING_AGENT_TOOLS = [
  repoSearchTool,
  runChecksTool,
  listDesignAssetsTool,
  readDesignAssetTool,
  listDesignDocsTool,
  readDesignDocTool,
  createDesignDocFromMarkupTool,
  replaceDesignSectionFromMarkupTool,
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
] as const;

import fs from "node:fs";
import path from "node:path";

import { logger } from "@/utils/logger";
import type { ToolService } from "../tools";
import { generateToolsPrompt } from "./tools";

/**
 * Load a prompt file from the systemPrompt directory
 * @throws Error if file does not exist
 */
const loadPrompt = (fileName: string): string => {
  const filePath = path.join(__dirname, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`System prompt file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8");
};

/**
 * Load shared modules (critical-rules and tool-guide)
 */
const loadSharedModules = () => {
  const criticalRules = loadPrompt("./shared/critical-rules.md");
  const toolGuide = loadPrompt("./shared/tool-guide.md");
  return { criticalRules, toolGuide };
};

/**
 * Generate tool sections for the prompt
 */
const generateToolSections = (toolService: ToolService): string => {
  const allToolNames = toolService.toolNames;

  return [
    `
====

TOOLS

## Base Tools

${generateToolsPrompt(toolService.baseTools, allToolNames)}
`,
    `
## Custom Tools

${generateToolsPrompt(toolService.customedTools, allToolNames)}

====
`,
  ].join("\n");
};

/**
 * Get system prompt for the specified conversation type
 */
export function getSystemPrompt(
  toolService: ToolService,
  conversationType: "main" | "sub" = "main",
): string {
  const systemPrompt =
    conversationType === "main"
      ? getMainSystemPrompt(toolService)
      : getSubSystemPrompt(toolService);
  logger.debug("System Prompt:", systemPrompt);
  return systemPrompt;
}

/**
 * Main Agent system prompt
 * Assembly order:
 * 1. shared/critical-rules.md (critical rules at top)
 * 2. main/identity.md
 * 3. main/rules.md
 * 4. main/workflow.md (structured workflow guidance)
 * 5. shared/tool-guide.md
 * 6. [Dynamic tool list]
 */
export const getMainSystemPrompt = (toolService: ToolService): string => {
  const { criticalRules, toolGuide } = loadSharedModules();
  const identity = loadPrompt("./main/identity.md");
  const rules = loadPrompt("./main/rules.md");
  const workflow = loadPrompt("./main/workflow.md");

  logger.debug("Loaded main agent prompts:", { identity, rules, workflow });

  return [
    criticalRules,
    identity,
    rules,
    workflow,
    toolGuide,
    generateToolSections(toolService),
  ].join("\n\n");
};

/**
 * Sub Agent system prompt
 * Assembly order:
 * 1. shared/critical-rules.md (critical rules at top)
 * 2. sub/identity.md
 * 3. sub/rules.md
 * 4. shared/tool-guide.md
 * 5. [Dynamic tool list]
 */
export const getSubSystemPrompt = (toolService: ToolService): string => {
  const { criticalRules, toolGuide } = loadSharedModules();
  const identity = loadPrompt("./sub/identity.md");
  const rules = loadPrompt("./sub/rules.md");

  logger.debug("Loaded sub agent prompts:", { identity, rules });

  return [criticalRules, identity, rules, toolGuide, generateToolSections(toolService)].join(
    "\n\n",
  );
};

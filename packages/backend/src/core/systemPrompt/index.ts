import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { logger } from "@/utils/logger";
import type { ToolService } from "../tools";
import type { WorkflowPromptScope } from "../workflow";

const promptBaseDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load a prompt file from the systemPrompt directory
 * @throws Error if file does not exist
 */
const loadPrompt = (fileName: string): string => {
  const filePath = path.join(promptBaseDir, fileName);
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
 * Get system prompt for the specified conversation type
 */
export function getSystemPrompt(
  toolService: ToolService,
  promptScope: WorkflowPromptScope = "controller",
): string {
  const systemPrompt =
    promptScope === "controller"
      ? getControllerSystemPrompt(toolService)
      : getWorkerSystemPrompt(toolService);
  logger.debug("System Prompt:", systemPrompt);
  return systemPrompt;
}

/**
 * Main Agent system prompt
 * Assembly order:
 * 1. shared/critical-rules.md
 * 2. main/identity.md
 * 3. main/rules.md
 * 4. main/workflow.md
 * 5. shared/tool-guide.md
 */
export const getControllerSystemPrompt = (_toolService: ToolService): string => {
  const { criticalRules, toolGuide } = loadSharedModules();
  const identity = loadPrompt("./main/identity.md");
  const rules = loadPrompt("./main/rules.md");
  const workflow = loadPrompt("./main/workflow.md");

  logger.debug("Loaded main agent prompts:", { identity, rules, workflow });

  return [criticalRules, identity, rules, workflow, toolGuide].join("\n\n");
};

/**
 * Sub Agent system prompt
 * Assembly order:
 * 1. shared/critical-rules.md
 * 2. sub/identity.md
 * 3. sub/rules.md
 * 4. shared/tool-guide.md
 */
export const getWorkerSystemPrompt = (_toolService: ToolService): string => {
  const { criticalRules, toolGuide } = loadSharedModules();
  const identity = loadPrompt("./sub/identity.md");
  const rules = loadPrompt("./sub/rules.md");

  logger.debug("Loaded sub agent prompts:", { identity, rules });

  return [criticalRules, identity, rules, toolGuide].join("\n\n");
};

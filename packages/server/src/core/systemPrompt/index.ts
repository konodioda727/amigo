import fs from "node:fs";
import path from "node:path";
import type { ToolService } from "../tools";
import { generateToolsPrompt } from "./tools";
const loadPropmpt = (fileName: string) => {
  return fs.readFileSync(path.join(__dirname, fileName), "utf-8");
};

/**
 * 获取系统提示词
 */
export function getSystemPrompt(
  toolService: ToolService,
  conversationType: "main" | "sub" = "main",
): string {
  const systemPrompt =
    conversationType === "main"
      ? getMainSystemPrompt(toolService)
      : getSubSystemPrompt(toolService);
  console.log("System Prompt:", systemPrompt);
  return systemPrompt;
}
/**
 * 主 Agent 使用的系统提示词
 * @param toolService
 * @returns
 */
export const getMainSystemPrompt = (toolService: ToolService) => {
  const rules = loadPropmpt("./main/rules.md");
  const objective = loadPropmpt("./main/objective.md");
  const toolsGuide = loadPropmpt("./tooluseGuide.md");
  console.log("Loaded system prompts:", { rules, objective });
  
  // 获取所有可用工具名称
  const allToolNames = toolService.toolNames;
  
  // 通过 toolService 获取所有工具类
  return [
    objective,
    rules,
    toolsGuide,
    `
    =====
    # 基础工具
    
    ${generateToolsPrompt(toolService.baseTools, allToolNames)}

    `,
    `
    =====
    # 用户自定义工具

    ${generateToolsPrompt(toolService.customedTools, allToolNames)}
    
    `,
  ].join("\n\n");
};

/**
 * 子 Agent 使用的系统提示词
 * @param toolService
 * @returns
 */
export const getSubSystemPrompt = (toolService: ToolService) => {
  const rules = loadPropmpt("./sub/rules.md");
  const objective = loadPropmpt("./sub/objective.md");
  const toolsGuide = loadPropmpt("./tooluseGuide.md");
  
  // 获取所有可用工具名称
  const allToolNames = toolService.toolNames;
  
  return [
    objective,
    rules,
    toolsGuide,
    `
    =====
    # 基础工具
    
    ${generateToolsPrompt(toolService.baseTools, allToolNames)}

    `,
    `
    =====
    # 用户自定义工具

    ${generateToolsPrompt(toolService.customedTools, allToolNames)}
    
    `,
  ].join("\n\n");
};

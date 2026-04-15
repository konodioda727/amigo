import type { WorkflowState } from "@amigo-llm/types";
import { buildRulesPromptAppendix } from "@/core/rules";
import { getGlobalState } from "@/globalState";
import { getSystemPrompt } from "../../systemPrompt";
import type { ToolService } from "../../tools";
import { resolveWorkflowPromptScope } from "../../workflow";
import { readSystemPromptAppendix } from "./conversationContext";

export const buildConversationSystemPrompt = ({
  toolService,
  workflowState,
  customPrompt,
  context,
}: {
  toolService: ToolService;
  workflowState: Partial<WorkflowState> | undefined;
  customPrompt?: string;
  context?: unknown;
}): string => {
  const promptScope = resolveWorkflowPromptScope({ workflowState });
  const configuredPrompt = getGlobalState("systemPrompts")?.[promptScope]?.trim();
  let systemPrompt = configuredPrompt || getSystemPrompt(toolService, promptScope);
  const ruleProvider = getGlobalState("ruleProvider");
  const extraSystemPrompt = (getGlobalState("extraSystemPrompt") || "").trim();
  const scopedExtraSystemPrompt = (
    getGlobalState("extraSystemPrompts")?.[promptScope] || ""
  ).trim();
  const contextAppendix = readSystemPromptAppendix(context, promptScope);
  const providerAppendix = ruleProvider
    ?.getSystemPromptAppendix({
      promptScope,
      context,
    })
    ?.trim();
  const rulesAppendix = buildRulesPromptAppendix({
    provider: ruleProvider,
    promptScope,
    context,
  })?.trim();
  const shouldAppendInheritedExtras = promptScope !== "worker";

  if (shouldAppendInheritedExtras && extraSystemPrompt) {
    systemPrompt += `\n\n=====应用追加系统提示词:\n${extraSystemPrompt}`;
  }
  if (shouldAppendInheritedExtras && scopedExtraSystemPrompt) {
    systemPrompt += `\n\n=====按 workflow 角色追加系统提示词:\n${scopedExtraSystemPrompt}`;
  }

  if (shouldAppendInheritedExtras && contextAppendix) {
    systemPrompt += `\n\n=====上下文系统提示补充:\n${contextAppendix}`;
  }
  if (providerAppendix) {
    systemPrompt += `\n\n=====宿主规则补充:\n${providerAppendix}`;
  }
  if (rulesAppendix) {
    systemPrompt += `\n\n=====按需规则文档:\n${rulesAppendix}`;
  }
  if (customPrompt?.trim()) {
    systemPrompt += `\n\n=====用户自定义提示词:\n${customPrompt.trim()}`;
  }
  return systemPrompt;
};

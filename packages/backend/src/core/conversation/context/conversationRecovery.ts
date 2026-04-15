import type { ToolInterface } from "@amigo-llm/types";
import { FilePersistedMemory } from "../../memory";
import { type AmigoLlm, getLlm } from "../../model";
import { getBaseTools, ToolService } from "../../tools";
import { resolveWorkflowPromptScope } from "../../workflow";
import { readContextUserId } from "./conversationContext";

export const buildRecoveredConversationRuntime = (
  taskId: string,
  allCustomTools: ToolInterface<any>[],
): {
  memory: FilePersistedMemory;
  llm: AmigoLlm;
  toolService: ToolService;
} => {
  const memory = new FilePersistedMemory(taskId);
  const llm = getLlm(
    memory.modelConfigSnapshot
      ? {
          modelConfigSnapshot: memory.modelConfigSnapshot,
          userId: readContextUserId(memory.context),
        }
      : undefined,
  );
  const promptScope = resolveWorkflowPromptScope({
    workflowState: memory.workflowState,
    toolNames: memory.toolNames,
    parentId: memory.getFatherTaskId,
  });
  const baseTools = getBaseTools(promptScope);

  const toolNames = memory.toolNames;
  const baseToolNames = new Set(baseTools.map((tool) => tool.name));
  const hasExplicitBaseToolSelection = toolNames.some((name) => baseToolNames.has(name));

  const selectedBaseTools =
    toolNames.length > 0 && hasExplicitBaseToolSelection
      ? baseTools.filter((tool) => toolNames.includes(tool.name))
      : baseTools;

  const selectedCustomTools =
    toolNames.length > 0
      ? allCustomTools.filter((tool) => toolNames.includes(tool.name))
      : allCustomTools;

  const toolService = new ToolService(selectedBaseTools, selectedCustomTools);
  return { memory, llm, toolService };
};

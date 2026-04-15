import type { ChatMessage, WorkflowState } from "@amigo-llm/types";
import type { FilePersistedMemory } from "../../memory";
import {
  buildWorkflowStateSystemMessage,
  createExecutionWorkerWorkflowState,
  createWorkflowState,
  resolveWorkflowPromptScope,
  WORKFLOW_STATE_MESSAGE_PREFIX,
} from "../../workflow";

export const resolveConversationWorkflowFallbackState = ({
  persistedWorkflowState,
  toolNames,
  parentId,
  allowLegacyWorkerInference,
}: {
  persistedWorkflowState?: WorkflowState | null;
  toolNames: string[];
  parentId?: string;
  allowLegacyWorkerInference?: boolean;
}): Partial<WorkflowState> => {
  if (persistedWorkflowState) {
    return {
      currentPhase: persistedWorkflowState.currentPhase,
      agentRole: persistedWorkflowState.agentRole,
    };
  }

  if (
    allowLegacyWorkerInference &&
    resolveWorkflowPromptScope({
      toolNames,
      parentId,
    }) === "worker"
  ) {
    return createExecutionWorkerWorkflowState();
  }

  return createWorkflowState();
};

export const getLatestWorkflowStateAnnouncement = (messages: ChatMessage[]): string | undefined =>
  [...messages]
    .reverse()
    .find((message) => message.content.startsWith(WORKFLOW_STATE_MESSAGE_PREFIX))?.content;

export const announceWorkflowState = ({
  memory,
  workflowState,
  force = false,
}: {
  memory: FilePersistedMemory;
  workflowState: WorkflowState;
  force?: boolean;
}): void => {
  const content = buildWorkflowStateSystemMessage(workflowState);
  if (!force && getLatestWorkflowStateAnnouncement(memory.messages) === content) {
    return;
  }

  memory.addMessage({
    role: "user",
    type: "system",
    partial: false,
    content,
  });
};

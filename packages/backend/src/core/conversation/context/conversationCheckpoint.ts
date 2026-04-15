import type { ChatMessage, WorkflowAgentRole, WorkflowPhase } from "@amigo-llm/types";
import type { FilePersistedMemory } from "../../memory";

export const CHECKPOINT_MESSAGE_PREFIX = "[Checkpoint]";

export interface ConversationCheckpointPayload {
  kind: "phase_complete" | "task_complete";
  summary: string;
  result: string;
  currentPhase?: WorkflowPhase;
  completedPhase?: WorkflowPhase;
  agentRole?: WorkflowAgentRole;
}

const toTrimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export const normalizeCheckpointPayload = (
  value: unknown,
): ConversationCheckpointPayload | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const kind =
    payload.kind === "phase_complete" || payload.kind === "task_complete" ? payload.kind : null;
  const summary = toTrimmedString(payload.summary);
  const result = toTrimmedString(payload.result);

  if (!kind || !summary || !result) {
    return null;
  }

  const currentPhase = toTrimmedString(payload.currentPhase) as WorkflowPhase;
  const completedPhase = toTrimmedString(payload.completedPhase) as WorkflowPhase;
  const agentRole = toTrimmedString(payload.agentRole) as WorkflowAgentRole;

  return {
    kind,
    summary,
    result,
    ...(currentPhase ? { currentPhase } : {}),
    ...(completedPhase ? { completedPhase } : {}),
    ...(agentRole ? { agentRole } : {}),
  };
};

export const buildCheckpointMessage = (payload: ConversationCheckpointPayload): string =>
  [
    CHECKPOINT_MESSAGE_PREFIX,
    `类型：${payload.kind}`,
    ...(payload.completedPhase ? [`已完成阶段：${payload.completedPhase}`] : []),
    ...(payload.currentPhase ? [`当前阶段：${payload.currentPhase}`] : []),
    ...(payload.agentRole ? [`当前角色：${payload.agentRole}`] : []),
    `摘要：${payload.summary}`,
    "结果：",
    payload.result,
  ].join("\n");

export const getLatestCheckpointMessage = (messages: ChatMessage[]): string | undefined =>
  [...messages]
    .reverse()
    .find(
      (message) =>
        message.type === "checkpoint" && message.content.startsWith(CHECKPOINT_MESSAGE_PREFIX),
    )?.content;

export const announceConversationCheckpoint = ({
  memory,
  payload,
}: {
  memory: FilePersistedMemory;
  payload: ConversationCheckpointPayload;
}): void => {
  const content = buildCheckpointMessage(payload);
  if (getLatestCheckpointMessage(memory.messages) === content) {
    return;
  }

  memory.addMessage({
    role: "user",
    type: "checkpoint",
    partial: false,
    content,
  });
};

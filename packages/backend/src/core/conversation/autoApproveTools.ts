import { getGlobalState } from "@/globalState";

export const DEFAULT_AUTO_APPROVE_TOOL_NAMES = [
  "askFollowupQuestion",
  "completeTask",
  "browserSearch",
  "readSkillBundle",
  "reviewSubTask",
] as const;

const getDefaultAutoApproveToolNames = (): readonly string[] => {
  const configured = getGlobalState("defaultAutoApproveToolNames");
  return configured || DEFAULT_AUTO_APPROVE_TOOL_NAMES;
};

export const getConfiguredAutoApproveToolNames = (): string[] =>
  Array.from(
    new Set([
      ...getDefaultAutoApproveToolNames(),
      ...(getGlobalState("autoApproveToolNames") || []),
    ]),
  );

export const normalizeAutoApproveToolNames = (toolNames: string[]): string[] =>
  Array.from(
    new Set([
      ...getDefaultAutoApproveToolNames(),
      ...toolNames.map((name) => name.trim()).filter(Boolean),
    ]),
  );

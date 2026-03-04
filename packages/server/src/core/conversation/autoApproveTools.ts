import { getGlobalState } from "@/globalState";

export const DEFAULT_AUTO_APPROVE_TOOL_NAMES = [
  "think",
  "askFollowupQuestion",
  "completeTask",
] as const;

export const getConfiguredAutoApproveToolNames = (): string[] =>
  Array.from(
    new Set([
      ...DEFAULT_AUTO_APPROVE_TOOL_NAMES,
      ...(getGlobalState("autoApproveToolNames") || []),
    ]),
  );

export const normalizeAutoApproveToolNames = (toolNames: string[]): string[] =>
  Array.from(
    new Set([
      ...DEFAULT_AUTO_APPROVE_TOOL_NAMES,
      ...toolNames.map((name) => name.trim()).filter(Boolean),
    ]),
  );

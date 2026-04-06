import type { ChatMessage } from "@amigo-llm/types";
import type { ToolHistoryProfile, ToolProgressKind } from "@amigo-llm/types/src/tool";
import type { Conversation } from "./Conversation";
import {
  getToolInteractionSignature,
  parseAssistantToolCallMessage,
  parseToolResultMessage,
} from "./toolTranscript";

type ToolInteraction = {
  toolName: string;
  toolCallId?: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  isError?: boolean;
  signature: string;
  progressKind?: ToolProgressKind;
  resourceKeys: string[];
};

type LoopDetection =
  | {
      kind: "repeated_same_interaction";
      toolName: string;
      count: number;
    }
  | {
      kind: "resource_read_loop";
      toolName: string;
      resourceKey: string;
      count: number;
    }
  | {
      kind: "tool_oscillation";
      cycle: string[];
      count: number;
    }
  | {
      kind: "no_progress";
      toolNames: string[];
      count: number;
    };

const REPEATED_SAME_INTERACTION_THRESHOLD = 2;
const REPEATED_RESOURCE_READ_THRESHOLD = 3;
const OSCILLATION_MIN_INTERACTIONS = 4;
const NO_PROGRESS_WINDOW = 4;

const MUTATING_TOOL_NAMES = new Set([
  "editFile",
  "installDependencies",
  "updateDevServer",
  "updateTaskDocs",
  "completeTask",
]);

const RESOURCE_READ_TOOL_NAMES = new Set([
  "listFiles",
  "readFile",
  "readRules",
  "browserSearch",
  "readTaskDocs",
  "readDesignDoc",
  "readSkillBundle",
]);

type HistoryProfileResolver = (toolName: string) => ToolHistoryProfile<string> | undefined;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];

const uniqueStrings = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

const extractResourceKeys = (interaction: ToolInteraction): string[] => {
  if (interaction.toolName === "readFile") {
    const argumentPaths = uniqueStrings(
      readStringArray(interaction.arguments.filePaths).map((filePath) => `file:${filePath}`),
    );
    if (argumentPaths.length > 0) {
      return argumentPaths;
    }

    const resultRecord = asRecord(interaction.result);
    const filePaths = uniqueStrings(
      readStringArray(resultRecord?.filePaths).map((filePath) => `file:${filePath}`),
    );
    if (filePaths.length > 0) {
      return filePaths;
    }

    const files = Array.isArray(resultRecord?.files) ? resultRecord.files : [];
    return uniqueStrings(
      files
        .map((file) => asRecord(file))
        .map((file) => (typeof file?.filePath === "string" ? `file:${file.filePath}` : ""))
        .filter(Boolean),
    );
  }

  if (interaction.toolName === "listFiles") {
    const directoryPath =
      typeof interaction.arguments.directoryPath === "string"
        ? interaction.arguments.directoryPath.trim()
        : "";
    if (directoryPath) {
      return [`dir:${directoryPath}`];
    }

    const resultRecord = asRecord(interaction.result);
    const resolvedDirectoryPath =
      typeof resultRecord?.directoryPath === "string" ? resultRecord.directoryPath.trim() : "";
    return resolvedDirectoryPath ? [`dir:${resolvedDirectoryPath}`] : ["dir:."];
  }

  if (interaction.toolName === "browserSearch") {
    const query =
      typeof interaction.arguments.query === "string" ? interaction.arguments.query.trim() : "";
    return query ? [`search:${query}`] : [];
  }

  if (interaction.toolName === "readTaskDocs") {
    const phase =
      typeof interaction.arguments.phase === "string" ? interaction.arguments.phase.trim() : "";
    return phase ? [`taskdoc:${phase}`] : [];
  }

  if (interaction.toolName === "readRules") {
    return uniqueStrings(
      readStringArray(interaction.arguments.ids).map((ruleId) => `rule:${ruleId}`),
    );
  }

  if (interaction.toolName === "readDesignDoc") {
    const pageId =
      typeof interaction.arguments.pageId === "string" ? interaction.arguments.pageId.trim() : "";
    return pageId ? [`designdoc:${pageId}`] : [];
  }

  if (interaction.toolName === "readSkillBundle") {
    const bundleName =
      typeof interaction.arguments.bundleName === "string"
        ? interaction.arguments.bundleName.trim()
        : "";
    return bundleName ? [`skill:${bundleName}`] : [];
  }

  return [];
};

const inferFallbackProgressKind = (toolName: string): ToolProgressKind | undefined => {
  if (MUTATING_TOOL_NAMES.has(toolName)) {
    return toolName === "completeTask" ? "completion" : "write";
  }
  if (RESOURCE_READ_TOOL_NAMES.has(toolName)) {
    return toolName === "browserSearch" ? "search" : "read";
  }
  if (toolName === "bash" || toolName === "runChecks") {
    return "execute";
  }
  return undefined;
};

const collectToolInteractions = (
  messages: ChatMessage[],
  resolveHistoryProfile?: HistoryProfileResolver,
): ToolInteraction[] => {
  const interactions: ToolInteraction[] = [];

  for (let index = 0; index < messages.length - 1; index++) {
    const toolCallMessage = messages[index];
    const toolResultMessage = messages[index + 1];
    if (!toolCallMessage || !toolResultMessage) {
      continue;
    }

    const toolCall = parseAssistantToolCallMessage(toolCallMessage);
    if (!toolCall) {
      continue;
    }

    const toolResult = parseToolResultMessage(toolResultMessage);
    if (!toolResult || toolResult.toolName !== toolCall.toolName) {
      continue;
    }

    if (
      toolCall.toolCallId &&
      toolResult.toolCallId &&
      toolCall.toolCallId !== toolResult.toolCallId
    ) {
      continue;
    }

    const historyProfile = resolveHistoryProfile?.(toolCall.toolName);
    const resourceKeys = historyProfile?.getResourceKeys
      ? historyProfile.getResourceKeys({
          params: toolCall.arguments,
          result: toolResult.result,
          error: toolResult.error,
          isError: toolResult.isError,
        })
      : extractResourceKeys({
          toolName: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          arguments: toolCall.arguments,
          result: toolResult.result,
          error: toolResult.error,
          isError: toolResult.isError,
          signature: "",
          resourceKeys: [],
        });

    interactions.push({
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      arguments: toolCall.arguments,
      result: toolResult.result,
      error: toolResult.error,
      isError: toolResult.isError,
      signature: getToolInteractionSignature(toolCall, toolResult),
      progressKind: historyProfile?.progressKind ?? inferFallbackProgressKind(toolCall.toolName),
      resourceKeys,
    });
    index += 1;
  }

  return interactions;
};

const detectRepeatedSameInteraction = (interactions: ToolInteraction[]): LoopDetection | null => {
  let reference: ToolInteraction | null = null;
  let count = 0;

  for (let index = interactions.length - 1; index >= 0; index--) {
    const interaction = interactions[index];
    if (!interaction) {
      continue;
    }
    if (!reference) {
      reference = interaction;
      count = 1;
      continue;
    }

    if (reference.signature === interaction.signature) {
      count += 1;
      continue;
    }

    break;
  }

  if (!reference || count < REPEATED_SAME_INTERACTION_THRESHOLD) {
    return null;
  }

  return {
    kind: "repeated_same_interaction",
    toolName: reference.toolName,
    count,
  };
};

const detectRepeatedResourceReads = (interactions: ToolInteraction[]): LoopDetection | null => {
  let referenceKey: string | null = null;
  let referenceToolName: string | null = null;
  let count = 0;

  for (let index = interactions.length - 1; index >= 0; index--) {
    const interaction = interactions[index];
    if (!interaction) {
      continue;
    }

    if (
      !["read", "search"].includes(interaction.progressKind || "") ||
      interaction.progressKind === "write" ||
      interaction.progressKind === "completion"
    ) {
      break;
    }

    const resourceKeys = interaction.resourceKeys;
    if (resourceKeys.length !== 1) {
      break;
    }

    const resourceKey = resourceKeys[0];
    if (!resourceKey) {
      break;
    }
    if (!referenceKey) {
      referenceKey = resourceKey;
      referenceToolName = interaction.toolName;
      count = 1;
      continue;
    }

    if (referenceKey === resourceKey) {
      count += 1;
      continue;
    }

    break;
  }

  if (!referenceKey || !referenceToolName || count < REPEATED_RESOURCE_READ_THRESHOLD) {
    return null;
  }

  return {
    kind: "resource_read_loop",
    toolName: referenceToolName,
    resourceKey: referenceKey,
    count,
  };
};

const isRepeatingCycle = (toolNames: string[], cycleLength: number): boolean => {
  if (toolNames.length < cycleLength * 2 || toolNames.length % cycleLength !== 0) {
    return false;
  }

  const cycle = toolNames.slice(0, cycleLength);
  return toolNames.every((toolName, index) => toolName === cycle[index % cycleLength]);
};

const detectToolOscillation = (interactions: ToolInteraction[]): LoopDetection | null => {
  const recent = interactions.slice(-6);
  if (recent.length < OSCILLATION_MIN_INTERACTIONS) {
    return null;
  }

  if (
    recent.some(
      (interaction) =>
        interaction.progressKind === "write" || interaction.progressKind === "completion",
    )
  ) {
    return null;
  }

  const toolNames = recent.map((interaction) => interaction.toolName);
  for (const cycleLength of [2, 3]) {
    const candidate = toolNames.slice(-cycleLength * 2);
    if (isRepeatingCycle(candidate, cycleLength)) {
      return {
        kind: "tool_oscillation",
        cycle: candidate.slice(0, cycleLength),
        count: candidate.length,
      };
    }
  }

  return null;
};

const detectNoProgress = (interactions: ToolInteraction[]): LoopDetection | null => {
  const recent = interactions.slice(-NO_PROGRESS_WINDOW);
  if (recent.length < NO_PROGRESS_WINDOW) {
    return null;
  }

  if (
    recent.some(
      (interaction) =>
        interaction.progressKind === "write" || interaction.progressKind === "completion",
    )
  ) {
    return null;
  }

  const distinctSignatures = new Set(recent.map((interaction) => interaction.signature));
  if (distinctSignatures.size > 2) {
    return null;
  }

  return {
    kind: "no_progress",
    toolNames: uniqueStrings(recent.map((interaction) => interaction.toolName)),
    count: recent.length,
  };
};

const toLoopGuidance = (detection: LoopDetection): string => {
  switch (detection.kind) {
    case "repeated_same_interaction":
      return `同一个工具 ${detection.toolName} 已使用相同参数连续执行 ${detection.count} 次，并得到等价结果。不要再次调用相同工具和参数；请直接利用现有结果进入下一步，或直接结束当前轮。`;
    case "resource_read_loop":
      return `你已经连续 ${detection.count} 次读取同一资源 ${detection.resourceKey}。不要继续重复读取；请基于现有内容做修改、验证，或明确结束当前任务。`;
    case "tool_oscillation":
      return `最近工具调用在 ${detection.cycle.join(" -> ")} 之间来回振荡，且没有形成推进。不要继续重复这个循环；请改用能推进状态的工具，或直接基于现有结果总结结论。`;
    case "no_progress":
      return `最近 ${detection.count} 次工具调用没有带来新的文件修改或新的事实结果，工具集合为 ${detection.toolNames.join("、")}。不要继续同类空转；请切换到能推进任务状态的工具，或直接结束当前轮。`;
  }
};

export class LoopDetectorManager {
  detect(
    messages: ChatMessage[],
    resolveHistoryProfile?: HistoryProfileResolver,
  ): LoopDetection | null {
    const interactions = collectToolInteractions(messages, resolveHistoryProfile);
    return (
      detectRepeatedSameInteraction(interactions) ||
      detectRepeatedResourceReads(interactions) ||
      detectToolOscillation(interactions) ||
      detectNoProgress(interactions)
    );
  }

  buildRetryMessages(conversation: Conversation): ChatMessage[] | undefined {
    const detection = this.detect(conversation.memory.messages || [], (toolName) =>
      conversation.toolService?.getToolHistoryProfile?.(toolName),
    );
    if (!detection) {
      return undefined;
    }

    return [
      {
        role: "system",
        type: "message",
        partial: false,
        content: toLoopGuidance(detection),
      },
    ];
  }
}

export const loopDetectorManager = new LoopDetectorManager();

export const __testing__ = {
  collectToolInteractions,
  detectNoProgress,
  detectRepeatedResourceReads,
  detectRepeatedSameInteraction,
  detectToolOscillation,
  extractResourceKeys,
};

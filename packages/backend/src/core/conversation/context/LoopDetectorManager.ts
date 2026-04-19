import type { ChatMessage } from "@amigo-llm/types";
import type { ToolHistoryProfile, ToolProgressKind } from "@amigo-llm/types/src/tool";
import type { Conversation } from "../Conversation";
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
      kind: "tool_error_detour";
      failedToolName: string;
      detourToolNames: string[];
      count: number;
    }
  | {
      kind: "symbol_search_loop";
      count: number;
      toolNames: string[];
      symbolNames: string[];
    }
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
    }
  | {
      kind: "read_without_progress";
      toolNames: string[];
      count: number;
    };

const REPEATED_SAME_INTERACTION_THRESHOLD = 2;
const SYMBOL_SEARCH_LOOP_THRESHOLD = 2;
const REPEATED_RESOURCE_READ_THRESHOLD = 3;
const OSCILLATION_MIN_INTERACTIONS = 4;
const NO_PROGRESS_WINDOW = 4;
const EARLY_TASKDOC_REMINDER_THRESHOLD = 5;

const MUTATING_TOOL_NAMES = new Set(["editFile", "updateDevServer", "finishPhase"]);

const RESOURCE_READ_TOOL_NAMES = new Set([
  "listFiles",
  "readFile",
  "readRules",
  "browserSearch",
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

const SYMBOL_SEARCH_COMMAND_PATTERN = /(^|\s)(rg|grep)\b/;
const SYMBOL_IDENTIFIER_PATTERN = /\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g;
const SYMBOL_STOP_WORDS = new Set([
  "rg",
  "grep",
  "function",
  "const",
  "let",
  "var",
  "export",
  "default",
  "class",
  "interface",
  "type",
  "enum",
  "return",
  "if",
  "else",
]);

const extractQuotedSegments = (command: string): string[] =>
  Array.from(command.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g), (match) => match[2] || "");

const looksLikeCodeSymbol = (term: string): boolean => /[A-Z]/.test(term) || term.includes("_");

const extractSymbolSearchTerms = (command: string): string[] => {
  const searchSpace = extractQuotedSegments(command);
  const haystacks = searchSpace.length > 0 ? searchSpace : [command];

  return uniqueStrings(
    haystacks
      .flatMap((segment) => segment.match(SYMBOL_IDENTIFIER_PATTERN) || [])
      .map((term) => term.trim())
      .filter(
        (term) =>
          Boolean(term) &&
          !SYMBOL_STOP_WORDS.has(term) &&
          !term.includes("/") &&
          !term.includes(".") &&
          looksLikeCodeSymbol(term),
      ),
  );
};

const isSymbolSearchCommand = (command: string): boolean =>
  SYMBOL_SEARCH_COMMAND_PATTERN.test(command) && extractSymbolSearchTerms(command).length > 0;

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
    return toolName === "finishPhase" ? "completion" : "write";
  }
  if (RESOURCE_READ_TOOL_NAMES.has(toolName)) {
    return toolName === "browserSearch" ? "search" : "read";
  }
  if (toolName === "bash") {
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

const detectToolErrorDetour = (interactions: ToolInteraction[]): LoopDetection | null => {
  const detourInteractions: ToolInteraction[] = [];

  for (let index = interactions.length - 1; index >= 0; index -= 1) {
    const interaction = interactions[index];
    if (!interaction) {
      continue;
    }

    if (interaction.isError) {
      if (detourInteractions.length === 0) {
        return null;
      }

      if (detourInteractions.some((candidate) => candidate.toolName === interaction.toolName)) {
        return null;
      }

      return {
        kind: "tool_error_detour",
        failedToolName: interaction.toolName,
        detourToolNames: uniqueStrings(
          detourInteractions.map((candidate) => candidate.toolName).reverse(),
        ),
        count: detourInteractions.length,
      };
    }

    if (interaction.progressKind === "write" || interaction.progressKind === "completion") {
      return null;
    }

    detourInteractions.push(interaction);
  }

  return null;
};

const detectSymbolSearchLoop = (interactions: ToolInteraction[]): LoopDetection | null => {
  const recentSymbolSearches: ToolInteraction[] = [];

  for (let index = interactions.length - 1; index >= 0; index -= 1) {
    const interaction = interactions[index];
    if (!interaction) {
      continue;
    }

    if (interaction.progressKind === "write" || interaction.progressKind === "completion") {
      break;
    }

    if (interaction.toolName !== "bash") {
      break;
    }

    const command =
      typeof interaction.arguments.command === "string" ? interaction.arguments.command.trim() : "";
    if (!command || !isSymbolSearchCommand(command)) {
      break;
    }

    recentSymbolSearches.push(interaction);
  }

  if (recentSymbolSearches.length < SYMBOL_SEARCH_LOOP_THRESHOLD) {
    return null;
  }

  const symbolNames = uniqueStrings(
    recentSymbolSearches.flatMap((interaction) =>
      extractSymbolSearchTerms(
        typeof interaction.arguments.command === "string" ? interaction.arguments.command : "",
      ),
    ),
  );

  return {
    kind: "symbol_search_loop",
    count: recentSymbolSearches.length,
    toolNames: uniqueStrings(recentSymbolSearches.map((interaction) => interaction.toolName)),
    symbolNames,
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

const detectReadWithoutProgress = (interactions: ToolInteraction[]): LoopDetection | null => {
  const recentReadTools: string[] = [];

  for (let index = interactions.length - 1; index >= 0; index -= 1) {
    const interaction = interactions[index];
    if (!interaction) {
      continue;
    }

    if (interaction.progressKind === "write" || interaction.progressKind === "completion") {
      break;
    }

    if (!["read", "search"].includes(interaction.progressKind || "")) {
      break;
    }

    recentReadTools.push(interaction.toolName);
  }

  if (recentReadTools.length < EARLY_TASKDOC_REMINDER_THRESHOLD) {
    return null;
  }

  return {
    kind: "read_without_progress",
    toolNames: uniqueStrings(recentReadTools.reverse()),
    count: recentReadTools.length,
  };
};

const toLoopGuidance = (
  detection: LoopDetection,
  conversation?: Pick<Conversation, "currentWorkflowPhase" | "workflowAgentRole">,
): string => {
  switch (detection.kind) {
    case "tool_error_detour":
      return `刚才失败的是工具 ${detection.failedToolName}，但随后你又连续 ${detection.count} 次改用了 ${detection.detourToolNames.join("、")}。不要因为一次工具报错就立刻换路径。除非错误已经明确说明 ${detection.failedToolName} 在当前场景不适用，否则下一步应优先修正参数、格式、调用方式或前置条件，并重试 ${detection.failedToolName}。`;
    case "symbol_search_loop": {
      const symbolSuffix =
        detection.symbolNames.length > 0
          ? `（例如 ${detection.symbolNames.slice(0, 3).join("、")}）`
          : "";
      if (conversation?.workflowAgentRole === "execution_worker") {
        return `你已经连续 ${detection.count} 次用 bash/rg 追代码符号${symbolSuffix}。不要继续用文本搜索反复追同一批 symbol。若诊断、编译报错或现有上下文已经给出 filePath + line + symbolName，下一步优先使用 goToDefinition / findReferences / getDiagnostics；如果其中某一处修复已经明确，就先 editFile 落这一处，再决定是否继续读别的文件。只有在完全没有符号锚点或当前文件没有可用 LSP 时，才继续 bash/rg。`;
      }
      return `你已经连续 ${detection.count} 次用 bash/rg 追代码符号${symbolSuffix}。若上下文已经有 filePath、line 或具体 symbol，优先改用 goToDefinition / findReferences / getDiagnostics；bash/rg 只保留给 repo 级粗搜索或 LSP 不可用的情况。`;
    }
    case "repeated_same_interaction":
      if (
        conversation?.workflowAgentRole === "execution_worker" &&
        ["readFile", "listFiles", "bash"].includes(detection.toolName)
      ) {
        return `同一个工具 ${detection.toolName} 已使用相同参数连续执行 ${detection.count} 次，并得到等价结果。不要再次调用相同工具和参数。若目标文件和改动点已明确，下一步直接使用 editFile，先落当前这一处，而不是继续把其余文件都读完；若实现已完成，调用 bash 做必要验证或 finishPhase。`;
      }
      return `同一个工具 ${detection.toolName} 已使用相同参数连续执行 ${detection.count} 次，并得到等价结果。不要再次调用相同工具和参数；请直接利用现有结果进入下一步，或直接结束当前轮。`;
    case "resource_read_loop":
      return conversation?.workflowAgentRole === "execution_worker"
        ? `你已经连续 ${detection.count} 次读取同一资源 ${detection.resourceKey}。不要继续重复读取。下一步应直接使用 editFile、bash 或 finishPhase；除非出现新的明确阻塞，否则不要再读同一文件。`
        : `你已经连续 ${detection.count} 次读取同一资源 ${detection.resourceKey}。不要继续重复读取；请基于现有内容做修改、验证，或明确结束当前任务。`;
    case "tool_oscillation":
      return `最近工具调用在 ${detection.cycle.join(" -> ")} 之间来回振荡，且没有形成推进。不要继续重复这个循环；请改用能推进状态的工具，或直接基于现有结果总结结论。`;
    case "no_progress":
      return conversation?.workflowAgentRole === "execution_worker"
        ? `最近 ${detection.count} 次工具调用没有带来新的文件修改或新的事实结果，工具集合为 ${detection.toolNames.join("、")}。不要继续空转。若已有任何一处改动点明确，下一步先直接调用 editFile 落这一处，而不是继续把其余文件都读完；若实现已完成，调用 bash 做必要验证或 finishPhase。`
        : `最近 ${detection.count} 次工具调用没有带来新的文件修改或新的事实结果，工具集合为 ${detection.toolNames.join("、")}。不要继续同类空转；请切换到能推进任务状态的工具，或直接结束当前轮。`;
    case "read_without_progress": {
      if (conversation?.workflowAgentRole === "execution_worker") {
        return `你已经连续 ${detection.count} 次使用读取/搜索类工具（${detection.toolNames.join("、")}）。不要继续只读空转。若目标文件和任何一处改动点已明确，下一步必须优先使用 editFile 先落这一处，不要为了批量修改把其他文件先读完；bash 只用于搜索、安装明确依赖、构建、测试和诊断，不要再用它代替编辑。`;
      }
      return `你已经连续 ${detection.count} 次使用读取/搜索类工具（${detection.toolNames.join("、")}），但还没有推进任务状态。不要继续只读空转；如果执行方案已经清楚，下一步直接调用 taskList（action=execute，必要时连 tasks 一起传入），或进入 editFile / bash / finishPhase。`;
    }
  }
};

export class LoopDetectorManager {
  detect(
    messages: ChatMessage[],
    resolveHistoryProfile?: HistoryProfileResolver,
  ): LoopDetection | null {
    const interactions = collectToolInteractions(messages, resolveHistoryProfile);
    return (
      detectToolErrorDetour(interactions) ||
      detectSymbolSearchLoop(interactions) ||
      detectRepeatedSameInteraction(interactions) ||
      detectRepeatedResourceReads(interactions) ||
      detectReadWithoutProgress(interactions) ||
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
        role: "user",
        type: "message",
        partial: false,
        content: toLoopGuidance(detection, conversation),
      },
    ];
  }
}

export const loopDetectorManager = new LoopDetectorManager();

export const __testing__ = {
  collectToolInteractions,
  detectReadWithoutProgress,
  detectNoProgress,
  detectRepeatedResourceReads,
  detectRepeatedSameInteraction,
  detectToolErrorDetour,
  detectSymbolSearchLoop,
  detectToolOscillation,
  extractSymbolSearchTerms,
  extractResourceKeys,
  isSymbolSearchCommand,
};

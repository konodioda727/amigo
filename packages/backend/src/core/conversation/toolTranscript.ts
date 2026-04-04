import type { ChatMessage } from "@amigo-llm/types";
import {
  normalizeToolResultForContinuationMemory,
  serializeToolResultForContinuationMemory,
} from "./toolResultSerialization";

export interface AssistantToolCallPayload {
  kind: "assistant_tool_call";
  toolCallId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultPayload {
  kind: "tool_result";
  toolCallId?: string;
  toolName: string;
  result?: unknown;
  error?: string;
  isError?: boolean;
  summary?: string;
}

type ParsedToolTranscriptPayload = AssistantToolCallPayload | ToolResultPayload;

const parseTranscriptPayload = (content: string): ParsedToolTranscriptPayload | null => {
  try {
    const parsed = JSON.parse(content) as ParsedToolTranscriptPayload;
    if (
      parsed?.kind === "assistant_tool_call" &&
      typeof parsed.toolName === "string" &&
      parsed.arguments &&
      typeof parsed.arguments === "object" &&
      !Array.isArray(parsed.arguments)
    ) {
      return parsed;
    }
    if (parsed?.kind === "tool_result" && typeof parsed.toolName === "string") {
      return parsed;
    }
  } catch {
    // Ignore malformed tool transcript payloads.
  }

  return null;
};

export const buildAssistantToolCallMemoryMessage = (params: {
  toolCallId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
  updateTime?: number;
}): ChatMessage => ({
  role: "assistant",
  type: "tool",
  content: JSON.stringify({
    kind: "assistant_tool_call",
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    arguments: params.arguments,
  } satisfies AssistantToolCallPayload),
  partial: false,
  updateTime: params.updateTime,
});

export const buildToolResultMemoryMessage = (params: {
  toolCallId?: string;
  toolName: string;
  result?: unknown;
  error?: string;
  isError?: boolean;
  summary?: string;
  updateTime?: number;
}): ChatMessage => ({
  role: "user",
  type: "tool",
  content: JSON.stringify({
    kind: "tool_result",
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    ...(params.result !== undefined
      ? {
          result: normalizeToolResultForContinuationMemory(params.toolName, params.result),
        }
      : {}),
    ...(typeof params.error === "string" ? { error: params.error } : {}),
    ...(params.isError ? { isError: true } : {}),
    ...(typeof params.summary === "string" && params.summary.trim()
      ? { summary: params.summary.trim() }
      : {}),
  } satisfies ToolResultPayload),
  partial: false,
  updateTime: params.updateTime,
});

export const parseAssistantToolCallMessage = (
  message: ChatMessage,
): AssistantToolCallPayload | null => {
  if (message.role !== "assistant" || message.type !== "tool") {
    return null;
  }

  const parsed = parseTranscriptPayload(message.content);
  return parsed?.kind === "assistant_tool_call" ? parsed : null;
};

export const parseToolResultMessage = (message: ChatMessage): ToolResultPayload | null => {
  if (message.role !== "user" || message.type !== "tool") {
    return null;
  }

  const parsed = parseTranscriptPayload(message.content);
  return parsed?.kind === "tool_result" ? parsed : null;
};

export const serializeToolResultPayloadForModel = (payload: ToolResultPayload): string => {
  const parts: Record<string, unknown> = {
    toolName: payload.toolName,
  };

  if (payload.toolCallId) {
    parts.toolCallId = payload.toolCallId;
  }
  if (payload.result !== undefined) {
    parts.result = payload.result;
  }
  if (payload.error) {
    parts.error = payload.error;
  }
  if (payload.isError) {
    parts.isError = true;
  }
  if (payload.summary?.trim()) {
    parts.summary = payload.summary.trim();
  }

  return JSON.stringify(parts, null, 2);
};

export const buildAssistantToolCallFallbackText = (payload: AssistantToolCallPayload): string =>
  JSON.stringify(
    {
      kind: payload.kind,
      toolCallId: payload.toolCallId,
      toolName: payload.toolName,
      arguments: payload.arguments,
    },
    null,
    2,
  );

export const buildToolResultFallbackText = (payload: ToolResultPayload): string =>
  serializeToolResultPayloadForModel(payload);

const toStableJson = (value: unknown): string => JSON.stringify(value);

export const getToolInteractionSignature = (
  toolCall: AssistantToolCallPayload,
  toolResult: ToolResultPayload,
): string =>
  toStableJson({
    toolName: toolCall.toolName,
    arguments: toolCall.arguments,
    result: toolResult.result,
    error: toolResult.error,
    isError: toolResult.isError,
  });

export const isEquivalentToolInteraction = (
  leftCall: AssistantToolCallPayload,
  leftResult: ToolResultPayload,
  rightCall: AssistantToolCallPayload,
  rightResult: ToolResultPayload,
): boolean =>
  getToolInteractionSignature(leftCall, leftResult) ===
  getToolInteractionSignature(rightCall, rightResult);

export const serializeRawToolResultForTranscript = (toolName: string, result: unknown): string =>
  serializeToolResultForContinuationMemory(toolName, result);

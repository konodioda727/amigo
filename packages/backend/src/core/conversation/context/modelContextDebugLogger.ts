import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AmigoLlm, AmigoLlmStreamOptions, AmigoModelMessage } from "@/core/model";
import type { ConversationContextSnapshotRecord } from "@/core/persistence/types";
import { getCacheRootPath } from "@/core/storage";
import { getGlobalState } from "@/globalState";
import { logger } from "@/utils/logger";

const SENTENCE_DELIMITERS = new Set(["\n", ".", "。", "！", "？", "!", "?", ";", "；"]);
const TRAILING_SENTENCE_CHARS = /["'”’)\]】》」』、\s]/;

export const extractCompletedSegments = (
  text: string,
  startIndex: number,
): { segments: string[]; nextIndex: number } => {
  if (!text || startIndex >= text.length) {
    return { segments: [], nextIndex: startIndex };
  }

  const segments: string[] = [];
  let segmentStart = startIndex;

  for (let i = startIndex; i < text.length; i++) {
    if (!SENTENCE_DELIMITERS.has(text[i] || "")) {
      continue;
    }

    let end = i + 1;
    while (end < text.length && TRAILING_SENTENCE_CHARS.test(text[end] || "")) {
      end += 1;
    }

    const segment = text.slice(segmentStart, end).trim();
    if (segment) {
      segments.push(segment);
    }
    segmentStart = end;
    i = end - 1;
  }

  return { segments, nextIndex: segmentStart };
};

type DebugEventType =
  | "context_snapshot"
  | "reasoning_sentence"
  | "assistant_sentence"
  | "tool_call_delta"
  | "tool_call_done"
  | "stream_end";

const ensureDirectory = (directory: string): void => {
  mkdirSync(directory, { recursive: true });
};

const appendJsonLine = (filePath: string, payload: Record<string, unknown>): void => {
  appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf-8");
};

const getDebugRootPath = (): string => path.join(getCacheRootPath(), "logs", "model-context-debug");

const toDebugSafeOptions = (options?: AmigoLlmStreamOptions): Record<string, unknown> => ({
  toolNames: options?.tools?.map((tool) => tool.name) || [],
  toolCount: options?.tools?.length || 0,
});

const buildSnapshotPayload = (params: {
  requestId: string;
  conversationId: string;
  conversationType?: string;
  llm: AmigoLlm;
  messages: AmigoModelMessage[];
  options?: AmigoLlmStreamOptions;
  workflowPhase?: string;
  agentRole?: string;
}) => ({
  timestamp: new Date().toISOString(),
  requestId: params.requestId,
  conversationId: params.conversationId,
  conversationType: params.conversationType || "unknown",
  model: params.llm.model,
  provider: params.llm.provider || "unknown",
  configId: params.llm.configId,
  workflowPhase: params.workflowPhase,
  agentRole: params.agentRole,
  messageCount: params.messages.length,
  options: toDebugSafeOptions(params.options),
  messages: params.messages,
});

const persistSnapshotToConversationProvider = (
  payload: ReturnType<typeof buildSnapshotPayload>,
): void => {
  const provider = getGlobalState("conversationPersistenceProvider");
  if (!provider?.recordModelContextSnapshot) {
    return;
  }

  const record: ConversationContextSnapshotRecord = {
    requestId: payload.requestId,
    conversationId: payload.conversationId,
    conversationType: payload.conversationType,
    model: payload.model,
    provider: payload.provider,
    configId: payload.configId,
    workflowPhase: payload.workflowPhase,
    agentRole: payload.agentRole,
    messageCount: payload.messageCount,
    toolNames: Array.isArray(payload.options?.toolNames)
      ? payload.options.toolNames.filter((value): value is string => typeof value === "string")
      : [],
    options: payload.options,
    messages: payload.messages,
    createdAt: payload.timestamp,
  };

  Promise.resolve(provider.recordModelContextSnapshot(record)).catch((error) => {
    logger.warn(
      `[ModelContextDebug] 持久化上下文快照失败 request=${payload.requestId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });
};

class ModelContextDebugSession {
  readonly requestId = randomUUID();
  readonly snapshotPath: string;
  private readonly eventsPath: string;
  private assistantIndex = 0;
  private reasoningIndex = 0;
  private enabled = true;

  constructor(params: {
    conversationId: string;
    conversationType?: string;
    llm: AmigoLlm;
    messages: AmigoModelMessage[];
    options?: AmigoLlmStreamOptions;
    workflowPhase?: string;
    agentRole?: string;
  }) {
    const debugRoot = getDebugRootPath();
    const dateBucket = new Date().toISOString().slice(0, 10);
    const snapshotDir = path.join(debugRoot, dateBucket, params.conversationId);
    this.eventsPath = path.join(debugRoot, "events.jsonl");
    this.snapshotPath = path.join(snapshotDir, `${this.requestId}.json`);

    try {
      ensureDirectory(snapshotDir);
      ensureDirectory(path.dirname(this.eventsPath));

      const snapshotPayload = buildSnapshotPayload({
        requestId: this.requestId,
        conversationId: params.conversationId,
        conversationType: params.conversationType,
        llm: params.llm,
        messages: params.messages,
        options: params.options,
        workflowPhase: params.workflowPhase,
        agentRole: params.agentRole,
      });

      writeFileSync(this.snapshotPath, `${JSON.stringify(snapshotPayload, null, 2)}\n`, "utf-8");
      appendJsonLine(this.eventsPath, {
        timestamp: snapshotPayload.timestamp,
        type: "context_snapshot" satisfies DebugEventType,
        requestId: this.requestId,
        conversationId: params.conversationId,
        snapshotPath: this.snapshotPath,
        messageCount: params.messages.length,
        model: params.llm.model,
        provider: params.llm.provider || "unknown",
      });
      persistSnapshotToConversationProvider(snapshotPayload);
    } catch (error) {
      this.enabled = false;
      logger.warn(
        `[ModelContextDebug] 初始化失败 conversation=${params.conversationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  observeReasoning(buffer: string, final = false): void {
    this.observeBuffer("reasoning_sentence", buffer, final);
  }

  observeAssistant(buffer: string, final = false): void {
    this.observeBuffer("assistant_sentence", buffer, final);
  }

  logToolCall(
    type: Extract<DebugEventType, "tool_call_delta" | "tool_call_done">,
    payload: Record<string, unknown>,
  ): void {
    this.appendEvent(type, payload);
  }

  finish(reason: string): void {
    this.appendEvent("stream_end", { reason });
  }

  private observeBuffer(
    type: Extract<DebugEventType, "reasoning_sentence" | "assistant_sentence">,
    buffer: string,
    final: boolean,
  ): void {
    if (!this.enabled || !buffer) {
      return;
    }

    const indexKey = type === "reasoning_sentence" ? "reasoningIndex" : "assistantIndex";
    const currentIndex = this[indexKey];
    const { segments, nextIndex } = extractCompletedSegments(buffer, currentIndex);
    this[indexKey] = nextIndex;

    for (const segment of segments) {
      this.appendEvent(type, { text: segment, final: false });
    }

    if (!final) {
      return;
    }

    const remaining = buffer.slice(this[indexKey]).trim();
    if (remaining) {
      this.appendEvent(type, { text: remaining, final: true });
    }
    this[indexKey] = buffer.length;
  }

  private appendEvent(type: DebugEventType, payload: Record<string, unknown>): void {
    if (!this.enabled) {
      return;
    }

    try {
      appendJsonLine(this.eventsPath, {
        timestamp: new Date().toISOString(),
        type,
        requestId: this.requestId,
        snapshotPath: this.snapshotPath,
        ...payload,
      });
    } catch (error) {
      this.enabled = false;
      logger.warn(
        `[ModelContextDebug] 写入事件失败 request=${this.requestId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

export const createModelContextDebugSession = (params: {
  conversationId: string;
  conversationType?: string;
  llm: AmigoLlm;
  messages: AmigoModelMessage[];
  options?: AmigoLlmStreamOptions;
  workflowPhase?: string;
  agentRole?: string;
}): ModelContextDebugSession => new ModelContextDebugSession(params);

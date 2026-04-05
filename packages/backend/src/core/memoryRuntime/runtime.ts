import type { ChatMessage } from "@amigo-llm/types";
import { logger } from "../../utils/logger";
import type { Conversation } from "../conversation";
import { getLlm } from "../model";
import { getConversationPersistenceProvider } from "../persistence";
import { reconcileLongTermCandidates } from "./longTermReconciler";
import { extractLongTermMemoryCandidatesWithModel } from "./modelLongTermExtractor";
import type {
  LongTermMemoryCandidate,
  MemoryConfig,
  MemoryContextMessage,
  MemoryStoreHit,
} from "./types";

const DEFAULT_LONG_TERM_TOP_K = 6;
const DEFAULT_LONG_TERM_MIN_SCORE = 0.15;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const readContextUserId = (context: unknown): string | null => {
  if (!isPlainObject(context) || typeof context.userId !== "string" || !context.userId.trim()) {
    return null;
  }
  return context.userId.trim();
};

const shouldTrackUserMessage = (message: ChatMessage): boolean =>
  message.role === "user" && !message.partial && message.type === "userSendMessage";

const resolveCurrentQuery = (conversation: Conversation): string => {
  const directInput = conversation.userInput.trim();
  if (directInput) {
    return directInput;
  }

  for (let index = conversation.memory.messages.length - 1; index >= 0; index -= 1) {
    const message = conversation.memory.messages[index];
    if (message && shouldTrackUserMessage(message)) {
      return message.content.trim();
    }
  }

  return "";
};

const isLongTermRecallIntent = (query: string): boolean => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return /(记得|偏好|习惯|默认|长期记忆|长期偏好|约束|规则)/i.test(normalized);
};

const isAlwaysRelevantMemory = (hit: MemoryStoreHit): boolean => {
  const kind = typeof hit.metadata.kind === "string" ? hit.metadata.kind : "";
  const topic = typeof hit.metadata.topic === "string" ? hit.metadata.topic : "";
  const scope = typeof hit.metadata.scope === "string" ? hit.metadata.scope : "";
  if (scope !== "user") {
    return false;
  }

  return (
    kind === "preference" ||
    kind === "constraint" ||
    ["response_language_preference", "interaction_preference", "user_constraint"].includes(topic)
  );
};

const deduplicateHits = (hits: MemoryStoreHit[]): MemoryStoreHit[] => {
  const map = new Map<string, MemoryStoreHit>();
  for (const hit of hits) {
    const existing = map.get(hit.id);
    if (!existing || hit.score > existing.score) {
      map.set(hit.id, hit);
    }
  }
  return Array.from(map.values());
};

const buildLongTermPrompt = (hits: MemoryStoreHit[]): string => {
  const lines = [
    "以下是当前用户的长期记忆。全局偏好与长期约束默认生效；若与本轮用户新输入冲突，以本轮用户新输入为准。",
    "",
  ];

  for (const [index, hit] of hits.entries()) {
    const topic = typeof hit.metadata.topic === "string" ? hit.metadata.topic : "memory";
    const scope = typeof hit.metadata.scope === "string" ? hit.metadata.scope : "user";
    lines.push(`${index + 1}. scope=${scope} topic=${topic}`);
    lines.push(hit.text.trim());
    lines.push("");
  }

  return lines.join("\n").trim();
};

export class SdkMemoryRuntime {
  constructor(private readonly config: MemoryConfig) {}

  isEnabled(): boolean {
    return this.isLongTermEnabled();
  }

  async handleUserMessage(payload: {
    taskId: string;
    message: ChatMessage;
    context?: unknown;
  }): Promise<void> {
    if (!this.isLongTermEnabled()) {
      return;
    }

    const userId = readContextUserId(payload.context);
    if (!userId || !shouldTrackUserMessage(payload.message)) {
      return;
    }

    await this.handleLongTermExtraction({
      taskId: payload.taskId,
      userId,
      userText: payload.message.content,
    });
  }

  async handleAssistantMessage(payload: {
    taskId: string;
    message: ChatMessage;
    context?: unknown;
  }): Promise<void> {
    void payload;
  }

  async buildContextMessages(conversation: Conversation): Promise<MemoryContextMessage[]> {
    const userId = readContextUserId(conversation.memory.context);
    if (!userId) {
      return [];
    }

    return this.buildLongTermContextMessages(resolveCurrentQuery(conversation), userId);
  }

  private isLongTermEnabled(): boolean {
    return (
      !!this.config.longTerm?.store &&
      !!this.config.longTerm?.embeddings &&
      this.config.longTerm?.enabled !== false
    );
  }

  private async buildLongTermContextMessages(
    query: string,
    userId: string,
  ): Promise<MemoryContextMessage[]> {
    if (!this.isLongTermEnabled() || !query.trim()) {
      return [];
    }

    const store = this.config.longTerm?.store;
    const embeddings = this.config.longTerm?.embeddings;
    if (!store || !embeddings) {
      return [];
    }

    const semanticHits = (
      await store.query({
        namespace: "long_term",
        vector: await embeddings.embedQuery(query),
        queryText: query,
        topK: this.config.longTerm?.topK ?? DEFAULT_LONG_TERM_TOP_K,
        minScore: this.config.longTerm?.minScore ?? DEFAULT_LONG_TERM_MIN_SCORE,
        hybrid: this.config.retrieval?.hybrid,
        filter: {
          userId,
        },
      })
    ).filter((hit) => typeof hit.metadata.scope !== "string" || hit.metadata.scope === "user");

    const pinnedQuery = "偏好 习惯 默认 规则 约束 回复语言 注释语言 协作方式";
    const pinnedHits = (
      await store.query({
        namespace: "long_term",
        vector: await embeddings.embedQuery(pinnedQuery),
        queryText: pinnedQuery,
        topK: this.config.longTerm?.topK ?? DEFAULT_LONG_TERM_TOP_K,
        minScore: 0.1,
        hybrid: this.config.retrieval?.hybrid,
        filter: {
          userId,
        },
      })
    ).filter((hit) => isAlwaysRelevantMemory(hit));

    let hits = deduplicateHits([...pinnedHits, ...semanticHits]);

    if (hits.length === 0 && isLongTermRecallIntent(query)) {
      hits = pinnedHits;
    }

    if (hits.length === 0) {
      return [];
    }

    logger.info(
      `[SdkMemoryRuntime] 注入长期记忆 userId=${userId} hits=${hits.length} query=${JSON.stringify(query)}`,
    );

    return [
      {
        message: {
          role: "system",
          type: "system",
          content: buildLongTermPrompt(hits),
          partial: false,
        },
      },
    ];
  }

  private async handleLongTermExtraction(params: {
    taskId: string;
    userId: string;
    userText: string;
  }): Promise<void> {
    const { taskId, userId, userText } = params;
    const store = this.config.longTerm?.store;
    const embeddings = this.config.longTerm?.embeddings;
    if (!store || !embeddings) {
      return;
    }

    const candidates = await this.extractLongTermCandidates({
      taskId,
      userId,
      userText,
    });
    if (candidates.length === 0) {
      return;
    }

    try {
      const documents = await reconcileLongTermCandidates({
        store,
        userId,
        candidates: this.deduplicateCandidates(candidates),
      });
      if (documents.length > 0) {
        const vectors = await embeddings.embedDocuments(documents.map((document) => document.text));
        await store.upsert(
          documents.map((document, index) => ({
            ...document,
            vector: vectors[index] || [],
          })),
        );
        logger.info(
          `[SdkMemoryRuntime] long-term 已写入 userId=${userId} count=${documents.length} topics=${documents
            .map((document) => String(document.metadata.topic || ""))
            .filter(Boolean)
            .join(",")}`,
        );
      }
    } catch (error) {
      logger.warn(
        `[SdkMemoryRuntime] long-term upsert 失败 userId=${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private deduplicateCandidates(candidates: LongTermMemoryCandidate[]): LongTermMemoryCandidate[] {
    const map = new Map<string, LongTermMemoryCandidate>();
    for (const candidate of candidates) {
      const key = `${candidate.scope}:${candidate.topic}`;
      const existing = map.get(key);
      if (!existing || existing.confidence < candidate.confidence) {
        map.set(key, candidate);
      }
    }
    return Array.from(map.values());
  }

  private async extractLongTermCandidates(params: {
    taskId: string;
    userId: string;
    userText: string;
  }): Promise<LongTermMemoryCandidate[]> {
    try {
      const llm = this.resolveLongTermExtractorLlm(params.taskId, params.userId);
      const modelCandidates = await extractLongTermMemoryCandidatesWithModel({
        llm,
        userText: params.userText,
        systemPrompt: this.config.longTerm?.extractor?.systemPrompt,
      });
      if (modelCandidates.length > 0) {
        return this.deduplicateCandidates(modelCandidates);
      }
      return [];
    } catch (error) {
      logger.warn(
        `[SdkMemoryRuntime] long-term model extractor 失败 taskId=${params.taskId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  private resolveLongTermExtractorLlm(taskId: string, userId: string) {
    const resolvedSelection = this.config.longTerm?.extractor?.resolveModelSelection?.({
      userId,
      taskId,
    });
    if (resolvedSelection) {
      return getLlm({
        model: resolvedSelection.model,
        configId: resolvedSelection.configId,
        userId,
      });
    }

    const selection = this.config.longTerm?.extractor?.model;
    if (selection) {
      if (typeof selection === "string") {
        return getLlm({ model: selection, userId });
      }
      return getLlm({
        model: selection.model,
        configId: selection.configId,
        userId,
      });
    }

    const snapshot = getConversationPersistenceProvider().load(taskId)?.modelConfigSnapshot;
    if (snapshot) {
      return getLlm({
        userId,
        modelConfigSnapshot: snapshot,
      });
    }

    return getLlm({ userId });
  }
}

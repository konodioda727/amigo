import type { LongTermMemoryCandidate, MemoryDocument, MemoryStore } from "./types";

const UNIQUE_TOPICS = new Set([
  "response_language_preference",
  "comment_language_preference",
  "interaction_preference",
]);

const stableHash = (value: string): string => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
};

const toDocumentId = (userId: string, candidate: LongTermMemoryCandidate): string =>
  UNIQUE_TOPICS.has(candidate.topic)
    ? `ltm:${userId}:${candidate.scope}:${candidate.topic}`
    : `ltm:${userId}:${candidate.scope}:${candidate.topic}:${stableHash(candidate.text)}`;

export const reconcileLongTermCandidates = async (params: {
  store: MemoryStore;
  userId: string;
  candidates: LongTermMemoryCandidate[];
}): Promise<MemoryDocument[]> => {
  const { store, userId, candidates } = params;
  const documents = candidates.map((candidate) => ({
    id: toDocumentId(userId, candidate),
    namespace: "long_term" as const,
    text: candidate.text,
    metadata: {
      userId,
      scope: candidate.scope,
      kind: candidate.kind,
      topic: candidate.topic,
      confidence: candidate.confidence,
      updatedAt: new Date().toISOString(),
    },
  }));

  if (store.delete) {
    for (const candidate of candidates) {
      if (!UNIQUE_TOPICS.has(candidate.topic)) {
        continue;
      }
      await store.delete({
        namespace: "long_term",
        filter: {
          userId,
          scope: candidate.scope,
          topic: candidate.topic,
        },
      });
    }
  }

  return documents;
};

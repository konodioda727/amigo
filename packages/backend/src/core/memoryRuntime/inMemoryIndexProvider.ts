import type {
  MemoryDocument,
  MemoryStore,
  MemoryStoreHit,
  MemoryStoreQuery,
  MemoryStoreRecord,
} from "./types";

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .map((part) => part.trim())
    .filter(Boolean);

const normalizeCharacters = (value: string): string[] =>
  Array.from(value.toLowerCase().replace(/\s+/g, "")).filter((char) =>
    /[a-z0-9\u4e00-\u9fff]/i.test(char),
  );

const matchesFilter = (
  metadata: Record<string, unknown>,
  filter: Record<string, unknown> | undefined,
): boolean => {
  if (!filter) {
    return true;
  }

  return Object.entries(filter).every(([key, expected]) => metadata[key] === expected);
};

const computeLexicalScore = (query: string | undefined, text: string): number => {
  const normalizedQuery = (query || "").trim().toLowerCase();
  const normalizedText = text.trim().toLowerCase();
  if (!normalizedQuery || !normalizedText) {
    return 0;
  }

  let score = 0;
  if (normalizedText.includes(normalizedQuery)) {
    score += 1;
  }

  const queryTokens = new Set(tokenize(normalizedQuery));
  const textTokens = new Set(tokenize(normalizedText));
  if (queryTokens.size > 0 && textTokens.size > 0) {
    let overlap = 0;
    for (const token of queryTokens) {
      if (textTokens.has(token)) {
        overlap += 1;
      }
    }
    score += overlap / queryTokens.size;
  }

  const queryChars = new Set(normalizeCharacters(normalizedQuery));
  const textChars = new Set(normalizeCharacters(normalizedText));
  if (queryChars.size > 0 && textChars.size > 0) {
    let charOverlap = 0;
    for (const char of queryChars) {
      if (textChars.has(char)) {
        charOverlap += 1;
      }
    }
    score += 0.5 * (charOverlap / queryChars.size);
  }

  return score;
};

const cosineSimilarity = (left: number[], right: number[]): number => {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] || 0;
    const rightValue = right[index] || 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / Math.sqrt(leftNorm * rightNorm);
};

const computeScore = (query: MemoryStoreQuery, record: MemoryStoreRecord): number => {
  const semanticScore = cosineSimilarity(query.vector, record.vector);
  const lexicalScore = computeLexicalScore(query.queryText, record.text);
  return semanticScore + lexicalScore * 0.25;
};

export class InMemoryMemoryStore implements MemoryStore {
  private readonly records = new Map<string, MemoryStoreRecord>();

  async upsert(records: MemoryStoreRecord[]): Promise<void> {
    for (const record of records) {
      this.records.set(record.id, {
        ...record,
        vector: [...record.vector],
        metadata: { ...record.metadata },
      });
    }
  }

  async query(input: MemoryStoreQuery): Promise<MemoryStoreHit[]> {
    const hits: MemoryStoreHit[] = [];

    for (const record of this.records.values()) {
      if (record.namespace !== input.namespace) {
        continue;
      }
      if (!matchesFilter(record.metadata, input.filter)) {
        continue;
      }

      const score = computeScore(input, record);
      if ((input.minScore ?? 0) > score) {
        continue;
      }
      if (score <= 0) {
        continue;
      }

      hits.push({
        id: record.id,
        text: record.text,
        score,
        metadata: { ...record.metadata },
      });
    }

    return hits.sort((left, right) => right.score - left.score).slice(0, input.topK);
  }

  async delete(input: {
    namespace?: "long_term";
    ids?: string[];
    filter?: Record<string, unknown>;
  }): Promise<void> {
    if (Array.isArray(input.ids) && input.ids.length > 0) {
      for (const id of input.ids) {
        this.records.delete(id);
      }
      return;
    }

    for (const [id, record] of this.records.entries()) {
      if (input.namespace && record.namespace !== input.namespace) {
        continue;
      }
      if (!matchesFilter(record.metadata, input.filter)) {
        continue;
      }
      this.records.delete(id);
    }
  }
}

export const createInMemoryMemoryStore = (): MemoryStore => new InMemoryMemoryStore();

export type MemoryIndexDocument = MemoryDocument;
export type InMemoryMemoryIndexProvider = InMemoryMemoryStore;
export const createInMemoryMemoryIndexProvider = createInMemoryMemoryStore;

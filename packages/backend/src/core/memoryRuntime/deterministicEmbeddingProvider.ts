import type { MemoryEmbeddingProvider } from "./types";

const DEFAULT_VECTOR_SIZE = 256;

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

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

export const embedTextDeterministically = (text: string, vectorSize: number): number[] => {
  const vector = new Array<number>(vectorSize).fill(0);
  const normalizedText = text.trim().toLowerCase();
  if (!normalizedText) {
    return vector;
  }

  const weightedTerms = [
    ...tokenize(normalizedText).map((token) => ({ term: `tok:${token}`, weight: 1 })),
    ...normalizeCharacters(normalizedText).map((char) => ({ term: `chr:${char}`, weight: 0.35 })),
  ];

  if (weightedTerms.length === 0) {
    return vector;
  }

  for (const { term, weight } of weightedTerms) {
    const hash = hashString(term);
    const index = hash % vectorSize;
    const sign = (hash & 1) === 0 ? 1 : -1;
    vector[index] += sign * weight;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
};

export class DeterministicMemoryEmbeddingProvider implements MemoryEmbeddingProvider {
  constructor(private readonly vectorSize = DEFAULT_VECTOR_SIZE) {}

  async embedQuery(text: string): Promise<number[]> {
    return embedTextDeterministically(text, this.vectorSize);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((text) => embedTextDeterministically(text, this.vectorSize));
  }
}

export const createDeterministicMemoryEmbeddingProvider = (
  vectorSize = DEFAULT_VECTOR_SIZE,
): MemoryEmbeddingProvider => new DeterministicMemoryEmbeddingProvider(vectorSize);

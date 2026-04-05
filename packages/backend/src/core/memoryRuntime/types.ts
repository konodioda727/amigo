import type { ChatMessage } from "@amigo-llm/types";
import type { ModelSelection } from "../model/contextConfig";

export type MemoryNamespace = "long_term";

export interface MemoryDocument {
  id: string;
  namespace: MemoryNamespace;
  text: string;
  metadata: Record<string, unknown>;
}

export interface MemoryStoreRecord extends MemoryDocument {
  vector: number[];
}

export interface MemoryStoreQuery {
  namespace: MemoryNamespace;
  vector: number[];
  topK: number;
  minScore?: number;
  filter?: Record<string, unknown>;
  hybrid?: boolean;
  queryText?: string;
}

export interface MemoryStoreHit {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface MemoryStore {
  upsert(records: MemoryStoreRecord[]): Promise<void>;
  query(input: MemoryStoreQuery): Promise<MemoryStoreHit[]>;
  delete?(input: {
    namespace?: MemoryNamespace;
    ids?: string[];
    filter?: Record<string, unknown>;
  }): Promise<void>;
}

export interface MemoryEmbeddingProvider {
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

export interface MemoryLongTermConfig {
  enabled?: boolean;
  store?: MemoryStore;
  embeddings?: MemoryEmbeddingProvider;
  topK?: number;
  minScore?: number;
  extractor?: {
    model?: string | ModelSelection;
    resolveModelSelection?: (payload: {
      userId?: string;
      taskId?: string;
    }) => ModelSelection | null;
    systemPrompt?: string;
  };
}

export interface MemoryRetrievalConfig {
  hybrid?: boolean;
}

export interface MemoryConfig {
  longTerm?: MemoryLongTermConfig;
  retrieval?: MemoryRetrievalConfig;
}

export interface MemoryContextMessage {
  message: ChatMessage;
}

export interface LongTermMemoryCandidate {
  scope: "user";
  kind: "preference" | "constraint";
  topic: string;
  text: string;
  confidence: number;
}

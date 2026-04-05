import { createHash } from "node:crypto";
import { logger } from "@amigo-llm/backend";
import type {
  MemoryConfig,
  MemoryEmbeddingProvider,
  MemoryStore,
  MemoryStoreHit,
  MemoryStoreQuery,
  MemoryStoreRecord,
} from "../../../../backend/src/core/memoryRuntime";
import { createDeterministicMemoryEmbeddingProvider } from "../../../../backend/src/core/memoryRuntime";

export type QdrantMemoryConfigOptions = {
  url: string;
  apiKey?: string;
  collectionPrefix?: string;
  vectorSize?: number;
  embeddings?: MemoryEmbeddingProvider;
  longTerm?: {
    enabled?: boolean;
    topK?: number;
    minScore?: number;
    extractor?: {
      systemPrompt?: string;
    };
  };
  retrieval?: {
    hybrid?: boolean;
  };
};

type QdrantPoint = {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
};

const DEFAULT_VECTOR_SIZE = 256;
const DEFAULT_COLLECTION_PREFIX = "amigo_memory";

const toCollectionName = (prefix: string): string => `${prefix}_long_term`;

const toQdrantPointId = (value: string): string => {
  const digest = createHash("sha256").update(value).digest("hex");
  const raw = digest.slice(0, 32).split("");
  raw[12] = "5";
  raw[16] = ["8", "9", "a", "b"][Number.parseInt(raw[16] || "0", 16) % 4] || "8";
  return `${raw.slice(0, 8).join("")}-${raw.slice(8, 12).join("")}-${raw.slice(12, 16).join("")}-${raw.slice(16, 20).join("")}-${raw.slice(20, 32).join("")}`;
};

const toQdrantFilter = (filter: Record<string, unknown> | undefined) => {
  if (!filter || Object.keys(filter).length === 0) {
    return undefined;
  }

  return {
    must: Object.entries(filter).map(([key, value]) => ({
      key,
      match: {
        value,
      },
    })),
  };
};

const parseQdrantHits = (payload: any): MemoryStoreHit[] => {
  const rawPoints = Array.isArray(payload?.result?.points)
    ? payload.result.points
    : Array.isArray(payload?.result)
      ? payload.result
      : [];

  return rawPoints
    .map((point: any) => ({
      id:
        typeof point?.payload?.documentId === "string" && point.payload.documentId
          ? point.payload.documentId
          : String(point?.id || ""),
      text:
        typeof point?.payload?.text === "string"
          ? point.payload.text
          : typeof point?.payload?.content === "string"
            ? point.payload.content
            : "",
      score: typeof point?.score === "number" ? point.score : 0,
      metadata:
        point?.payload && typeof point.payload === "object" && !Array.isArray(point.payload)
          ? { ...(point.payload as Record<string, unknown>) }
          : {},
    }))
    .filter((hit: MemoryStoreHit) => !!hit.id && !!hit.text);
};

class QdrantMemoryStore implements MemoryStore {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly collectionPrefix: string;
  private readonly vectorSize: number;
  private readonly ensureCollectionPromises = new Map<string, Promise<void>>();

  constructor(options: QdrantMemoryConfigOptions) {
    this.baseUrl = options.url.replace(/\/+$/, "");
    this.apiKey = options.apiKey?.trim() || undefined;
    this.collectionPrefix = options.collectionPrefix?.trim() || DEFAULT_COLLECTION_PREFIX;
    this.vectorSize = options.vectorSize || DEFAULT_VECTOR_SIZE;
  }

  async upsert(records: MemoryStoreRecord[]): Promise<void> {
    const grouped = new Map<string, MemoryStoreRecord[]>();
    for (const record of records) {
      const collectionName = toCollectionName(this.collectionPrefix);
      const rows = grouped.get(collectionName) || [];
      rows.push(record);
      grouped.set(collectionName, rows);
    }

    for (const [collectionName, rows] of grouped.entries()) {
      await this.ensureCollection(collectionName);
      const points: QdrantPoint[] = rows.map((row) => ({
        id: toQdrantPointId(row.id),
        vector: row.vector,
        payload: {
          documentId: row.id,
          text: row.text,
          namespace: row.namespace,
          ...row.metadata,
        },
      }));

      await this.request(`/collections/${collectionName}/points?wait=true`, {
        method: "PUT",
        body: JSON.stringify({ points }),
      });
    }
  }

  async query(input: MemoryStoreQuery): Promise<MemoryStoreHit[]> {
    const collectionName = toCollectionName(this.collectionPrefix);
    await this.ensureCollection(collectionName);

    const response = await this.request(`/collections/${collectionName}/points/query`, {
      method: "POST",
      body: JSON.stringify({
        query: input.vector,
        limit: input.topK,
        score_threshold: input.minScore,
        filter: toQdrantFilter(input.filter),
        with_payload: true,
        with_vector: false,
      }),
    });

    return parseQdrantHits(response);
  }

  async delete(input: {
    namespace?: "long_term";
    ids?: string[];
    filter?: Record<string, unknown>;
  }): Promise<void> {
    const collectionName = toCollectionName(this.collectionPrefix);
    await this.ensureCollection(collectionName);
    if (Array.isArray(input.ids) && input.ids.length > 0) {
      await this.request(`/collections/${collectionName}/points/delete?wait=true`, {
        method: "POST",
        body: JSON.stringify({ points: input.ids.map((id) => toQdrantPointId(id)) }),
      });
      return;
    }
    if (input.filter && Object.keys(input.filter).length > 0) {
      await this.request(`/collections/${collectionName}/points/delete?wait=true`, {
        method: "POST",
        body: JSON.stringify({ filter: toQdrantFilter(input.filter) }),
      });
    }
  }

  private async ensureCollection(collectionName: string): Promise<void> {
    const existing = this.ensureCollectionPromises.get(collectionName);
    if (existing) {
      await existing;
      return;
    }

    const promise = (async () => {
      const existingCollection = await this.request(`/collections/${collectionName}`, {
        method: "GET",
        allowNotFound: true,
      });
      if (existingCollection) {
        return;
      }

      await this.request(`/collections/${collectionName}`, {
        method: "PUT",
        body: JSON.stringify({
          vectors: {
            size: this.vectorSize,
            distance: "Cosine",
          },
        }),
      });
      logger.info(`[QdrantMemory] 已创建 collection ${collectionName}`);
    })();

    this.ensureCollectionPromises.set(collectionName, promise);
    try {
      await promise;
    } catch (error) {
      this.ensureCollectionPromises.delete(collectionName);
      throw error;
    }
  }

  private async request(
    pathname: string,
    input: {
      method: "GET" | "POST" | "PUT";
      body?: string;
      allowNotFound?: boolean;
    },
  ): Promise<any | null> {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method: input.method,
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { "api-key": this.apiKey } : {}),
      },
      ...(input.body ? { body: input.body } : {}),
    });

    if (input.allowNotFound && response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qdrant request failed (${response.status}) ${pathname}: ${errorText}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }
}

export const createQdrantMemoryStore = (options: QdrantMemoryConfigOptions): MemoryStore =>
  new QdrantMemoryStore(options);

export const createQdrantMemoryConfig = (
  options: QdrantMemoryConfigOptions,
): MemoryConfig | undefined => {
  const qdrantUrl = options.url.trim();
  if (!qdrantUrl) {
    return undefined;
  }

  const store = createQdrantMemoryStore({
    url: qdrantUrl,
    apiKey: options.apiKey?.trim() || undefined,
    collectionPrefix: options.collectionPrefix?.trim() || DEFAULT_COLLECTION_PREFIX,
    vectorSize: options.vectorSize || DEFAULT_VECTOR_SIZE,
  });
  const embeddings =
    options.embeddings || createDeterministicMemoryEmbeddingProvider(options.vectorSize);

  const longTermEnabled = options.longTerm?.enabled ?? true;
  if (!longTermEnabled) {
    return undefined;
  }

  return {
    ...(longTermEnabled
      ? {
          longTerm: {
            enabled: true,
            store,
            embeddings,
            topK: options.longTerm?.topK || 6,
            minScore: options.longTerm?.minScore || 0.15,
            ...(options.longTerm?.extractor ? { extractor: options.longTerm.extractor } : {}),
          },
        }
      : {}),
    retrieval: {
      hybrid: options.retrieval?.hybrid ?? true,
    },
  };
};

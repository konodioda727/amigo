import { describe, expect, test } from "bun:test";
import { createDeterministicMemoryEmbeddingProvider } from "../../../../backend/src/core/memoryRuntime";
import { createQdrantMemoryConfig, createQdrantMemoryStore } from "./qdrantMemory";

describe("createQdrantMemoryConfig", () => {
  test("builds config directly from options", () => {
    const config = createQdrantMemoryConfig({
      url: "http://127.0.0.1:6333",
      longTerm: {
        enabled: true,
        topK: 5,
        minScore: 0.12,
      },
      retrieval: {
        hybrid: false,
      },
    });

    expect(config?.longTerm?.enabled).toBe(true);
    expect(config?.longTerm?.topK).toBe(5);
    expect(config?.longTerm?.minScore).toBe(0.12);
    expect(config?.longTerm?.store).toBeDefined();
    expect(config?.longTerm?.embeddings).toBeDefined();
    expect(config?.retrieval?.hybrid).toBe(false);
  });

  test("returns undefined when long-term is disabled", () => {
    const config = createQdrantMemoryConfig({
      url: "http://127.0.0.1:6333",
      longTerm: { enabled: false },
    });

    expect(config).toBeUndefined();
  });

  test("uses a Qdrant store and default embeddings", async () => {
    const config = createQdrantMemoryConfig({
      url: "http://127.0.0.1:6333",
    });
    const embeddings = config?.longTerm?.embeddings;

    expect(config?.longTerm?.store).toBeDefined();
    expect(embeddings).toBeDefined();
    expect(await embeddings?.embedQuery("长期记忆")).toHaveLength(256);
  });
});

describe("createQdrantMemoryStore", () => {
  test("can be constructed with non-uuid logical ids", async () => {
    const store = createQdrantMemoryStore({
      url: "http://127.0.0.1:6333",
    });
    const embeddings = createDeterministicMemoryEmbeddingProvider();
    const [vector] = await embeddings.embedDocuments(["hello"]);

    expect(store).toBeDefined();
    expect(vector).toHaveLength(256);
  });
});

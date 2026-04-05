# Amigo App

`amigo-app` 现在默认在服务端启动时启用一套本地 Qdrant-backed `longTerm memory`，地址固定为 `http://127.0.0.1:6333`。默认启动配置在 [index.ts](/Users/lawkaiqing/code/amigo/packages/amigo/src/server/index.ts)。

## 默认行为

- 当前会话的短期记忆继续沿用现有 `conversation memory + checkpoint/compaction`
- SDK memory 只负责跨会话的 `longTerm` 记忆
- 不再维护额外的 `history index`

默认 Qdrant 配置：

```ts
qdrantMemory: {
  url: "http://127.0.0.1:6333",
  collectionPrefix: "amigo_memory",
  longTerm: {
    enabled: true,
    topK: 6,
    minScore: 0.15,
  },
  retrieval: {
    hybrid: true,
  },
}
```

启动前请先确保本地 Qdrant 已运行：

```bash
docker run --rm -p 6333:6333 qdrant/qdrant
```

## SDK Memory API

SDK 现在把向量化和存储拆开暴露。

- `MemoryEmbeddingProvider`
  - `embedQuery(text)`
  - `embedDocuments(texts)`
- `MemoryStore`
  - `upsert(records)`
  - `query({ namespace, vector, topK, minScore, filter, hybrid, queryText })`
  - `delete(...)`

相关类型和 helper 从 [sdk/index.ts](/Users/lawkaiqing/code/amigo/packages/backend/src/sdk/index.ts) 导出。

## App 侧接法

### 1. 直接传完整 memory 配置

```ts
import {
  createDeterministicMemoryEmbeddingProvider,
  createInMemoryMemoryStore,
} from "@amigo-llm/backend";
import { createAmigoApp } from "/Users/lawkaiqing/code/amigo/packages/amigo/src/server/app";

const embeddings = createDeterministicMemoryEmbeddingProvider();
const store = createInMemoryMemoryStore();

const app = await createAmigoApp({
  memory: {
    longTerm: {
      enabled: true,
      store,
      embeddings,
      topK: 6,
      minScore: 0.15,
    },
    retrieval: {
      hybrid: true,
    },
  },
});
```

### 2. 传 `qdrantMemory`

```ts
import { createAmigoApp } from "/Users/lawkaiqing/code/amigo/packages/amigo/src/server/app";

const app = await createAmigoApp({
  qdrantMemory: {
    url: "http://127.0.0.1:6333",
    collectionPrefix: "amigo_memory",
    longTerm: {
      enabled: true,
      topK: 6,
      minScore: 0.15,
    },
    retrieval: {
      hybrid: true,
    },
  },
});
```

`qdrantMemory` helper 定义在 [qdrantMemory.ts](/Users/lawkaiqing/code/amigo/packages/amigo/src/server/memory/qdrantMemory.ts)。

## 长期记忆抽取模型

长期记忆现在默认在每条 `user message` 到达时做抽取，不再等 `turn` 结束。

- 在 `amigo-app` 里，长期记忆提取模型优先从前端设置页读取
- 如果用户在设置页里选择了“长期记忆提取模型”，运行时会优先用那个模型
- `amigo-app` 的 `qdrantMemory` helper 不暴露 `extractor.model`，避免把这个选择硬编码在服务端配置里
- 对纯 SDK 接入，如果你给 `longTerm.extractor.model` 配了模型，SDK 会优先用这个模型做长期记忆判断和提取
- 如果没配，SDK 会默认回退到当前会话的模型快照
- 如果模型调用失败或返回空数组，本次就放弃写入，不做规则兜底

纯 SDK 配置示例：

```ts
longTerm: {
  enabled: true,
  store,
  embeddings,
  topK: 6,
  minScore: 0.15,
  extractor: {
    model: { configId: "memory-config", model: "gpt-4.1-mini" },
  },
}
```

## 现阶段限制

- `qdrantMemory` 默认用的是 deterministic embeddings，适合本地联调，不适合生产效果评估
- 如果要上生产，应该显式传一个真实的 `MemoryEmbeddingProvider`
- 当前没有额外的 history index，历史回忆依赖你们现有的短期记忆 / checkpoint 体系

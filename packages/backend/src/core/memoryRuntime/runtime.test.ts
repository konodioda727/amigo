import { afterEach, describe, expect, test } from "bun:test";
import type { ChatMessage } from "@amigo-llm/types";
import { setConversationPersistenceProvider } from "@/core/persistence";
import { setLlmFactory } from "../model";
import { createDeterministicMemoryEmbeddingProvider } from "./deterministicEmbeddingProvider";
import { createInMemoryMemoryStore } from "./inMemoryIndexProvider";
import { SdkMemoryRuntime } from "./runtime";

const noopProvider = {
  exists: () => false,
  load: () => null,
  save: () => true,
  delete: () => true,
  listConversationRelations: () => [],
  listSessionHistories: () => [],
};

const createConversation = (params: {
  id?: string;
  userId?: string;
  userInput?: string;
  messages?: ChatMessage[];
}) =>
  ({
    id: params.id || "task-1",
    userInput: params.userInput || "",
    memory: {
      context: params.userId ? { userId: params.userId } : {},
      messages: params.messages || [],
    },
  }) as any;

afterEach(() => {
  setConversationPersistenceProvider(undefined);
  setLlmFactory(undefined);
});

describe("SdkMemoryRuntime", () => {
  test("extracts long-term memories on user input and injects them on later turns", async () => {
    setConversationPersistenceProvider({
      ...noopProvider,
      load: () => ({
        taskId: "task-1",
        fatherTaskId: undefined,
        conversationStatus: "idle",
        toolNames: [],
        context: { userId: "user-1" },
        modelConfigSnapshot: {
          configId: "main-config",
          model: "main-model",
        },
        autoApproveToolNames: [],
        pendingToolCall: null,
        subTasks: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        websocketMessages: [],
      }),
    } as any);
    setLlmFactory((options) => ({
      model: options?.modelConfigSnapshot?.model || options?.model || "mock-model",
      configId: options?.modelConfigSnapshot?.configId || options?.configId,
      provider: "openai-compatible",
      async stream() {
        return (async function* () {
          yield {
            type: "text_delta" as const,
            text: JSON.stringify({
              candidates: [
                {
                  scope: "user",
                  kind: "preference",
                  topic: "response_language_preference",
                  text: "用户偏好使用中文交流。",
                  confidence: 0.96,
                },
              ],
            }),
          };
        })();
      },
    }));
    const longTermStore = createInMemoryMemoryStore();
    const embeddings = createDeterministicMemoryEmbeddingProvider();
    const runtime = new SdkMemoryRuntime({
      longTerm: {
        enabled: true,
        store: longTermStore,
        embeddings,
        topK: 4,
      },
    });

    await runtime.handleUserMessage({
      taskId: "task-1",
      context: { userId: "user-1" },
      message: {
        role: "user",
        type: "userSendMessage",
        content: "以后默认用中文和我沟通。",
        partial: false,
        updateTime: Date.now(),
      },
    });
    const longTermHits = await longTermStore.query({
      namespace: "long_term",
      vector: await embeddings.embedQuery("中文沟通偏好"),
      queryText: "中文沟通偏好",
      topK: 4,
      filter: { userId: "user-1" },
    });

    expect(longTermHits).toHaveLength(1);
    expect(longTermHits[0]?.text).toContain("中文");

    const conversation = createConversation({
      id: "task-1",
      userId: "user-1",
      userInput: "你记得我的沟通偏好吗？",
    });

    const contextMessages = await runtime.buildContextMessages(conversation);

    expect(contextMessages.some((item) => item.message.content.includes("长期记忆"))).toBe(true);
    expect(contextMessages.some((item) => item.message.content.includes("中文"))).toBe(true);
  });

  test("reconciles unique long-term topics by replacing older memories", async () => {
    setConversationPersistenceProvider({
      ...noopProvider,
      load: () => ({
        taskId: "task-1",
        fatherTaskId: undefined,
        conversationStatus: "idle",
        toolNames: [],
        context: { userId: "user-1" },
        modelConfigSnapshot: {
          configId: "main-config",
          model: "main-model",
        },
        autoApproveToolNames: [],
        pendingToolCall: null,
        subTasks: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        websocketMessages: [],
      }),
    } as any);
    setLlmFactory(() => ({
      model: "main-model",
      provider: "openai-compatible",
      async stream(messages) {
        const userTurnText = String(messages[1]?.content || "");
        const text = userTurnText.includes("英文")
          ? "用户偏好使用英文交流。"
          : "用户偏好使用中文交流。";
        return (async function* () {
          yield {
            type: "text_delta" as const,
            text: JSON.stringify({
              candidates: [
                {
                  scope: "user",
                  kind: "preference",
                  topic: "response_language_preference",
                  text,
                  confidence: 0.95,
                },
              ],
            }),
          };
        })();
      },
    }));
    const longTermStore = createInMemoryMemoryStore();
    const embeddings = createDeterministicMemoryEmbeddingProvider();
    const runtime = new SdkMemoryRuntime({
      longTerm: {
        enabled: true,
        store: longTermStore,
        embeddings,
        topK: 4,
      },
    });

    await runtime.handleUserMessage({
      taskId: "task-1",
      context: { userId: "user-1" },
      message: {
        role: "user",
        type: "userSendMessage",
        content: "以后默认用中文和我沟通。",
        partial: false,
        updateTime: Date.now(),
      },
    });
    await runtime.handleUserMessage({
      taskId: "task-1",
      context: { userId: "user-1" },
      message: {
        role: "user",
        type: "userSendMessage",
        content: "以后默认用英文和我沟通。",
        partial: false,
        updateTime: Date.now() + 1,
      },
    });
    const chineseHits = await longTermStore.query({
      namespace: "long_term",
      vector: await embeddings.embedQuery("中文沟通偏好"),
      queryText: "中文沟通偏好",
      topK: 4,
      filter: { userId: "user-1" },
    });
    const englishHits = await longTermStore.query({
      namespace: "long_term",
      vector: await embeddings.embedQuery("英文沟通偏好"),
      queryText: "英文沟通偏好",
      topK: 4,
      filter: { userId: "user-1" },
    });

    expect(chineseHits.some((hit) => hit.text.includes("中文"))).toBe(false);
    expect(englishHits.some((hit) => hit.text.includes("英文"))).toBe(true);
  });

  test("uses the configured extractor model when provided, otherwise falls back to the current conversation model snapshot", async () => {
    const llmCalls: Array<{ model?: string; configId?: string; snapshotModel?: string }> = [];
    setConversationPersistenceProvider({
      ...noopProvider,
      load: () => ({
        taskId: "task-1",
        fatherTaskId: undefined,
        conversationStatus: "idle",
        toolNames: [],
        context: { userId: "user-1" },
        modelConfigSnapshot: {
          configId: "main-config",
          model: "main-model",
        },
        autoApproveToolNames: [],
        pendingToolCall: null,
        subTasks: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        websocketMessages: [],
      }),
    } as any);
    setLlmFactory((options) => {
      llmCalls.push({
        model: options?.model,
        configId: options?.configId,
        snapshotModel: options?.modelConfigSnapshot?.model,
      });
      return {
        model: options?.model || options?.modelConfigSnapshot?.model || "mock-model",
        provider: "openai-compatible",
        async stream() {
          return (async function* () {
            yield { type: "text_delta" as const, text: JSON.stringify({ candidates: [] }) };
          })();
        },
      };
    });

    const store = createInMemoryMemoryStore();
    const embeddings = createDeterministicMemoryEmbeddingProvider();
    const configuredRuntime = new SdkMemoryRuntime({
      longTerm: {
        enabled: true,
        store,
        embeddings,
        extractor: {
          model: { configId: "memory-config", model: "memory-small" },
        },
      },
    });

    await configuredRuntime.handleUserMessage({
      taskId: "task-1",
      context: { userId: "user-1" },
      message: {
        role: "user",
        type: "userSendMessage",
        content: "以后默认用中文和我沟通。",
        partial: false,
        updateTime: Date.now(),
      },
    });
    const fallbackRuntime = new SdkMemoryRuntime({
      longTerm: {
        enabled: true,
        store,
        embeddings,
      },
    });
    await fallbackRuntime.handleUserMessage({
      taskId: "task-1",
      context: { userId: "user-1" },
      message: {
        role: "user",
        type: "userSendMessage",
        content: "以后默认用英文和我沟通。",
        partial: false,
        updateTime: Date.now() + 2,
      },
    });
    expect(llmCalls[0]).toEqual({
      model: "memory-small",
      configId: "memory-config",
      snapshotModel: undefined,
    });
    expect(llmCalls[1]).toEqual({
      model: undefined,
      configId: undefined,
      snapshotModel: "main-model",
    });
  });

  test("skips persistence when the model extractor returns no candidates", async () => {
    setConversationPersistenceProvider({
      ...noopProvider,
      load: () => ({
        taskId: "task-1",
        fatherTaskId: undefined,
        conversationStatus: "idle",
        toolNames: [],
        context: { userId: "user-1" },
        modelConfigSnapshot: {
          configId: "main-config",
          model: "main-model",
        },
        autoApproveToolNames: [],
        pendingToolCall: null,
        subTasks: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        websocketMessages: [],
      }),
    } as any);
    setLlmFactory(() => ({
      model: "main-model",
      provider: "openai-compatible",
      async stream() {
        return (async function* () {
          yield { type: "text_delta" as const, text: JSON.stringify({ candidates: [] }) };
        })();
      },
    }));

    const store = createInMemoryMemoryStore();
    const embeddings = createDeterministicMemoryEmbeddingProvider();
    const runtime = new SdkMemoryRuntime({
      longTerm: {
        enabled: true,
        store,
        embeddings,
      },
    });

    await runtime.handleUserMessage({
      taskId: "task-1",
      context: { userId: "user-1" },
      message: {
        role: "user",
        type: "userSendMessage",
        content: "我希望你记住我希望你每句话都用英文回答我这件事明白吗",
        partial: false,
        updateTime: Date.now(),
      },
    });
    const hits = await store.query({
      namespace: "long_term",
      vector: await embeddings.embedQuery("英文回答偏好"),
      queryText: "英文回答偏好",
      topK: 4,
      filter: { userId: "user-1" },
    });

    expect(hits).toHaveLength(0);
  });

  test("skips persistence when candidate confidence is below the minimum threshold", async () => {
    setConversationPersistenceProvider({
      ...noopProvider,
      load: () => ({
        taskId: "task-1",
        fatherTaskId: undefined,
        conversationStatus: "idle",
        toolNames: [],
        context: { userId: "user-1" },
        modelConfigSnapshot: {
          configId: "main-config",
          model: "main-model",
        },
        autoApproveToolNames: [],
        pendingToolCall: null,
        subTasks: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        websocketMessages: [],
      }),
    } as any);
    setLlmFactory(() => ({
      model: "main-model",
      provider: "openai-compatible",
      async stream() {
        return (async function* () {
          yield {
            type: "text_delta" as const,
            text: JSON.stringify({
              candidates: [
                {
                  scope: "user",
                  kind: "preference",
                  topic: "response_language_preference",
                  text: "用户偏好使用中文交流。",
                  confidence: 0.62,
                },
              ],
            }),
          };
        })();
      },
    }));

    const store = createInMemoryMemoryStore();
    const embeddings = createDeterministicMemoryEmbeddingProvider();
    const runtime = new SdkMemoryRuntime({
      longTerm: {
        enabled: true,
        store,
        embeddings,
      },
    });

    await runtime.handleUserMessage({
      taskId: "task-1",
      context: { userId: "user-1" },
      message: {
        role: "user",
        type: "userSendMessage",
        content: "以后默认用中文和我沟通。",
        partial: false,
        updateTime: Date.now(),
      },
    });

    const hits = await store.query({
      namespace: "long_term",
      vector: await embeddings.embedQuery("中文沟通偏好"),
      queryText: "中文沟通偏好",
      topK: 4,
      filter: { userId: "user-1" },
    });

    expect(hits).toHaveLength(0);
  });

  test("skips persistence for task-scoped taskdoc workflow instructions", async () => {
    setConversationPersistenceProvider({
      ...noopProvider,
      load: () => ({
        taskId: "task-1",
        fatherTaskId: undefined,
        conversationStatus: "idle",
        toolNames: [],
        context: { userId: "user-1" },
        modelConfigSnapshot: {
          configId: "main-config",
          model: "main-model",
        },
        autoApproveToolNames: [],
        pendingToolCall: null,
        subTasks: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        websocketMessages: [],
      }),
    } as any);
    setLlmFactory(() => ({
      model: "main-model",
      provider: "openai-compatible",
      async stream() {
        return (async function* () {
          yield {
            type: "text_delta" as const,
            text: JSON.stringify({
              candidates: [
                {
                  scope: "user",
                  kind: "constraint",
                  topic: "taskdoc_workflow_preference",
                  text: "在当前任务中，创建 taskdoc 前必须先询问用户，并且只做增量更新。",
                  confidence: 0.97,
                },
              ],
            }),
          };
        })();
      },
    }));

    const store = createInMemoryMemoryStore();
    const embeddings = createDeterministicMemoryEmbeddingProvider();
    const runtime = new SdkMemoryRuntime({
      longTerm: {
        enabled: true,
        store,
        embeddings,
      },
    });

    await runtime.handleUserMessage({
      taskId: "task-1",
      context: { userId: "user-1" },
      message: {
        role: "user",
        type: "userSendMessage",
        content:
          "为什么现在模型还是不会在创建 taskdoc 前询问用户？也不会渐进式根据用户回答生成部分文档或做部分修改？",
        partial: false,
        updateTime: Date.now(),
      },
    });

    const hits = await store.query({
      namespace: "long_term",
      vector: await embeddings.embedQuery("taskdoc workflow preference"),
      queryText: "taskdoc workflow preference",
      topK: 4,
      filter: { userId: "user-1" },
    });

    expect(hits).toHaveLength(0);
  });

  test("injects always-relevant long-term preferences even when the new query is unrelated", async () => {
    setConversationPersistenceProvider({
      ...noopProvider,
      load: () => ({
        taskId: "task-1",
        fatherTaskId: undefined,
        conversationStatus: "idle",
        toolNames: [],
        context: { userId: "user-1" },
        modelConfigSnapshot: {
          configId: "main-config",
          model: "main-model",
        },
        autoApproveToolNames: [],
        pendingToolCall: null,
        subTasks: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        websocketMessages: [],
      }),
    } as any);
    setLlmFactory(() => ({
      model: "main-model",
      provider: "openai-compatible",
      async stream() {
        return (async function* () {
          yield {
            type: "text_delta" as const,
            text: JSON.stringify({
              candidates: [
                {
                  scope: "user",
                  kind: "preference",
                  topic: "response_language_preference",
                  text: "用户偏好使用英文交流。",
                  confidence: 0.96,
                },
              ],
            }),
          };
        })();
      },
    }));

    const store = createInMemoryMemoryStore();
    const embeddings = createDeterministicMemoryEmbeddingProvider();
    const runtime = new SdkMemoryRuntime({
      longTerm: {
        enabled: true,
        store,
        embeddings,
      },
    });

    await runtime.handleUserMessage({
      taskId: "task-1",
      context: { userId: "user-1" },
      message: {
        role: "user",
        type: "userSendMessage",
        content: "以后默认用英文和我沟通。",
        partial: false,
        updateTime: Date.now(),
      },
    });
    const conversation = createConversation({
      id: "task-2",
      userId: "user-1",
      userInput: "你是谁",
    });
    const contextMessages = await runtime.buildContextMessages(conversation);

    expect(contextMessages.some((item) => item.message.content.includes("英文"))).toBe(true);
  });

  test("falls back to the latest user message when conversation.userInput is cleared", async () => {
    setConversationPersistenceProvider({
      ...noopProvider,
      load: () => ({
        taskId: "task-1",
        fatherTaskId: undefined,
        conversationStatus: "idle",
        toolNames: [],
        context: { userId: "user-1" },
        modelConfigSnapshot: {
          configId: "main-config",
          model: "main-model",
        },
        autoApproveToolNames: [],
        pendingToolCall: null,
        subTasks: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        websocketMessages: [],
      }),
    } as any);
    setLlmFactory(() => ({
      model: "main-model",
      provider: "openai-compatible",
      async stream() {
        return (async function* () {
          yield {
            type: "text_delta" as const,
            text: JSON.stringify({
              candidates: [
                {
                  scope: "user",
                  kind: "preference",
                  topic: "response_language_preference",
                  text: "用户偏好使用英文交流。",
                  confidence: 0.96,
                },
              ],
            }),
          };
        })();
      },
    }));

    const store = createInMemoryMemoryStore();
    const embeddings = createDeterministicMemoryEmbeddingProvider();
    const runtime = new SdkMemoryRuntime({
      longTerm: {
        enabled: true,
        store,
        embeddings,
      },
    });

    await runtime.handleUserMessage({
      taskId: "task-1",
      context: { userId: "user-1" },
      message: {
        role: "user",
        type: "userSendMessage",
        content: "以后默认用英文和我沟通。",
        partial: false,
        updateTime: Date.now(),
      },
    });

    const conversation = createConversation({
      id: "task-2",
      userId: "user-1",
      userInput: "",
      messages: [
        {
          role: "assistant",
          type: "tool",
          content: '{"toolName":"completeTask","result":"foo"}',
          partial: false,
          updateTime: Date.now(),
        } as ChatMessage,
        {
          role: "user",
          type: "userSendMessage",
          content: "直接结束就行，别再走旧完成工具。",
          partial: false,
          updateTime: Date.now() + 1,
        } as ChatMessage,
      ],
    });

    const contextMessages = await runtime.buildContextMessages(conversation);

    expect(contextMessages.some((item) => item.message.content.includes("英文"))).toBe(true);
  });
});

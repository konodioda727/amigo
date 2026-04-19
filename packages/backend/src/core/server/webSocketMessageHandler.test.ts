import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { broadcaster, conversationOrchestrator, conversationRepository } from "@/core/conversation";
import { setLlmFactory } from "@/core/model";

const actualMessageResolver = await import("@/core/messageResolver");
const actualGetSessions = await import("@/utils/getSessions");

const originalFindConversationIdByWs = broadcaster.findConversationIdByWs.bind(broadcaster);
const originalRemoveConnection = broadcaster.removeConnection.bind(broadcaster);
const originalGetConnectionCount = broadcaster.getConnectionCount.bind(broadcaster);
const originalGetConversation = conversationRepository.get.bind(conversationRepository);
const originalGetOrLoad = conversationRepository.getOrLoad.bind(conversationRepository);
const originalLoadConversation = conversationRepository.load.bind(conversationRepository);
const originalInterrupt = conversationOrchestrator.interrupt.bind(conversationOrchestrator);

const findConversationIdByWs = mock((ws: unknown) => originalFindConversationIdByWs(ws as never));
const removeConnection = mock((taskId: string, ws: unknown) =>
  originalRemoveConnection(taskId, ws as never),
);
const getConnectionCount = mock(() => 0);
const getConversation = mock((id: string) => originalGetConversation(id));
const getOrLoad = mock((id: string) => originalGetOrLoad(id));
const loadConversation = mock((id: string) => originalLoadConversation(id));
const interrupt = mock((conversation: unknown) => originalInterrupt(conversation as never));
const getResolver = mock((type: string, conversation: unknown) =>
  actualMessageResolver.getResolver(type as never, conversation as never),
);
const getSessionHistories = mock((userId?: string) =>
  actualGetSessions.getSessionHistories(userId),
);
const llmFactory = mock(
  (options?: { modelConfigSnapshot?: { configId?: string; model?: string } }) => ({
    configId: options?.modelConfigSnapshot?.configId || "default-config",
    model: options?.modelConfigSnapshot?.model || "default-model",
    provider: "mock-provider",
    async stream() {
      return (async function* () {})();
    },
  }),
);

mock.module("@/core/messageResolver", () => ({
  getResolver,
}));

mock.module("@/utils/getSessions", () => ({
  getSessionHistories,
}));

const { ServerWebSocketMessageHandler } = await import("./webSocketMessageHandler");

beforeEach(() => {
  findConversationIdByWs.mockClear();
  removeConnection.mockClear();
  getConnectionCount.mockClear();
  getConversation.mockReset();
  getConversation.mockImplementation((id: string) => originalGetConversation(id));
  getOrLoad.mockReset();
  getOrLoad.mockImplementation((id: string) => originalGetOrLoad(id));
  loadConversation.mockReset();
  loadConversation.mockImplementation((id: string) => originalLoadConversation(id));
  interrupt.mockClear();
  getResolver.mockReset();
  getResolver.mockImplementation((type: string, conversation: unknown) =>
    actualMessageResolver.getResolver(type as never, conversation as never),
  );
  getSessionHistories.mockReset();
  getSessionHistories.mockImplementation((userId?: string) =>
    actualGetSessions.getSessionHistories(userId),
  );
  broadcaster.findConversationIdByWs =
    findConversationIdByWs as typeof broadcaster.findConversationIdByWs;
  broadcaster.removeConnection = removeConnection as typeof broadcaster.removeConnection;
  broadcaster.getConnectionCount = getConnectionCount as typeof broadcaster.getConnectionCount;
  conversationRepository.get = getConversation as typeof conversationRepository.get;
  conversationRepository.getOrLoad = getOrLoad as typeof conversationRepository.getOrLoad;
  conversationRepository.load = loadConversation as typeof conversationRepository.load;
  conversationOrchestrator.interrupt = interrupt as typeof conversationOrchestrator.interrupt;
  llmFactory.mockClear();
  setLlmFactory(llmFactory);
});

afterEach(() => {
  broadcaster.findConversationIdByWs = originalFindConversationIdByWs;
  broadcaster.removeConnection = originalRemoveConnection;
  broadcaster.getConnectionCount = originalGetConnectionCount;
  conversationRepository.get = originalGetConversation;
  conversationRepository.getOrLoad = originalGetOrLoad;
  conversationRepository.load = originalLoadConversation;
  conversationOrchestrator.interrupt = originalInterrupt;
  setLlmFactory(undefined);
});

describe("ServerWebSocketMessageHandler.handleClose", () => {
  it("removes the socket without interrupting an active task when the last frontend connection closes", () => {
    findConversationIdByWs.mockReturnValue("task-1");
    const handler = new ServerWebSocketMessageHandler();
    const ws = {} as any;

    handler.handleClose(ws);

    expect(findConversationIdByWs).toHaveBeenCalledWith(ws);
    expect(removeConnection).toHaveBeenCalledWith("task-1", ws);
    expect(getConnectionCount).not.toHaveBeenCalled();
    expect(getConversation).not.toHaveBeenCalled();
    expect(interrupt).not.toHaveBeenCalled();
  });
});

describe("ServerWebSocketMessageHandler.handleMessage model snapshot", () => {
  it("applies a new model snapshot for waiting_tool_confirmation conversations", async () => {
    const setLlm = mock();
    const setModelConfigSnapshot = mock();
    const setContext = mock();
    const broadcastTaskStatusMapUpdated = mock();
    const process = mock(async () => {});
    const conversation = {
      id: "task-1",
      status: "waiting_tool_confirmation",
      llm: { configId: "old-config", model: "old-model", provider: "mock-provider" },
      memory: {
        context: { userId: "user-1" },
        setModelConfigSnapshot,
        setContext,
      },
      setLlm,
      broadcastTaskStatusMapUpdated,
    };

    getOrLoad.mockReturnValue(conversation);
    getResolver.mockReturnValue({ process });

    const handler = new ServerWebSocketMessageHandler();
    const ws = {
      data: { userId: "user-1" },
      send: mock(),
    } as any;

    await handler.handleMessage(
      ws,
      JSON.stringify({
        type: "userSendMessage",
        data: {
          taskId: "task-1",
          message: "switch model",
          modelConfigSnapshot: {
            configId: "new-config",
            model: "new-model",
          },
        },
      }),
    );

    expect(llmFactory).toHaveBeenCalledWith({
      modelConfigSnapshot: {
        configId: "new-config",
        model: "new-model",
      },
      userId: "user-1",
    });
    expect(setLlm.mock.calls[0]?.[0]).toMatchObject({
      configId: "new-config",
      model: "new-model",
      provider: "mock-provider",
    });
    expect(setModelConfigSnapshot).toHaveBeenCalledWith({
      configId: "new-config",
      model: "new-model",
      provider: "mock-provider",
    });
    expect(setContext).toHaveBeenCalledWith({
      userId: "user-1",
      model: "new-model",
      modelConfigId: "new-config",
    });
    expect(broadcastTaskStatusMapUpdated).toHaveBeenCalled();
    expect(process).toHaveBeenCalled();
  });

  it("does not apply a new model snapshot while the conversation is streaming", async () => {
    const setLlm = mock();
    const process = mock(async () => {});
    const conversation = {
      id: "task-1",
      status: "streaming",
      llm: { configId: "old-config", model: "old-model", provider: "mock-provider" },
      memory: {
        context: { userId: "user-1" },
        setModelConfigSnapshot: mock(),
        setContext: mock(),
      },
      setLlm,
      broadcastTaskStatusMapUpdated: mock(),
    };

    getOrLoad.mockReturnValue(conversation);
    getResolver.mockReturnValue({ process });

    const handler = new ServerWebSocketMessageHandler();
    const ws = {
      data: { userId: "user-1" },
      send: mock(),
    } as any;

    await handler.handleMessage(
      ws,
      JSON.stringify({
        type: "userSendMessage",
        data: {
          taskId: "task-1",
          message: "switch model",
          modelConfigSnapshot: {
            configId: "new-config",
            model: "new-model",
          },
        },
      }),
    );

    expect(setLlm).not.toHaveBeenCalled();
    expect(process).toHaveBeenCalled();
  });

  it("applies a new model snapshot when resuming an aborted conversation", async () => {
    const setLlm = mock();
    const setModelConfigSnapshot = mock();
    const setContext = mock();
    const broadcastTaskStatusMapUpdated = mock();
    const process = mock(async () => {});
    const conversation = {
      id: "task-1",
      status: "aborted",
      llm: { configId: "old-config", model: "old-model", provider: "mock-provider" },
      memory: {
        context: { userId: "user-1" },
        setModelConfigSnapshot,
        setContext,
      },
      setLlm,
      broadcastTaskStatusMapUpdated,
    };

    getOrLoad.mockReturnValue(conversation);
    getResolver.mockReturnValue({ process });

    const handler = new ServerWebSocketMessageHandler();
    const ws = {
      data: { userId: "user-1" },
      send: mock(),
    } as any;

    await handler.handleMessage(
      ws,
      JSON.stringify({
        type: "resume",
        data: {
          taskId: "task-1",
          modelConfigSnapshot: {
            configId: "new-config",
            model: "new-model",
          },
        },
      }),
    );

    expect(llmFactory).toHaveBeenCalledWith({
      modelConfigSnapshot: {
        configId: "new-config",
        model: "new-model",
      },
      userId: "user-1",
    });
    expect(setLlm.mock.calls[0]?.[0]).toMatchObject({
      configId: "new-config",
      model: "new-model",
      provider: "mock-provider",
    });
    expect(setModelConfigSnapshot).toHaveBeenCalledWith({
      configId: "new-config",
      model: "new-model",
      provider: "mock-provider",
    });
    expect(setContext).toHaveBeenCalledWith({
      userId: "user-1",
      model: "new-model",
      modelConfigId: "new-config",
    });
    expect(broadcastTaskStatusMapUpdated).toHaveBeenCalled();
    expect(process).toHaveBeenCalled();
  });

  it("applies a new model snapshot after an error so retries can use the new model", async () => {
    const setLlm = mock();
    const setModelConfigSnapshot = mock();
    const setContext = mock();
    const broadcastTaskStatusMapUpdated = mock();
    const process = mock(async () => {});
    const conversation = {
      id: "task-1",
      status: "error",
      llm: { configId: "old-config", model: "old-model", provider: "mock-provider" },
      memory: {
        context: { userId: "user-1" },
        setModelConfigSnapshot,
        setContext,
      },
      setLlm,
      broadcastTaskStatusMapUpdated,
    };

    getOrLoad.mockReturnValue(conversation);
    getResolver.mockReturnValue({ process });

    const handler = new ServerWebSocketMessageHandler();
    const ws = {
      data: { userId: "user-1" },
      send: mock(),
    } as any;

    await handler.handleMessage(
      ws,
      JSON.stringify({
        type: "userSendMessage",
        data: {
          taskId: "task-1",
          message: "retry with a different model",
          modelConfigSnapshot: {
            configId: "new-config",
            model: "new-model",
          },
        },
      }),
    );

    expect(setLlm.mock.calls[0]?.[0]).toMatchObject({
      configId: "new-config",
      model: "new-model",
      provider: "mock-provider",
    });
    expect(setModelConfigSnapshot).toHaveBeenCalledWith({
      configId: "new-config",
      model: "new-model",
      provider: "mock-provider",
    });
    expect(setContext).toHaveBeenCalledWith({
      userId: "user-1",
      model: "new-model",
      modelConfigId: "new-config",
    });
    expect(broadcastTaskStatusMapUpdated).toHaveBeenCalled();
    expect(process).toHaveBeenCalled();
  });
});

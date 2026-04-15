import { beforeEach, describe, expect, it, mock } from "bun:test";

const findConversationIdByWs = mock(() => "task-1");
const removeConnection = mock();
const getConnectionCount = mock(() => 0);
const getConversation = mock();
const getOrLoad = mock();
const interrupt = mock();
const getResolver = mock();
const getLlm = mock((options?: { modelConfigSnapshot?: { configId?: string; model: string } }) => ({
  configId: options?.modelConfigSnapshot?.configId || "default-config",
  model: options?.modelConfigSnapshot?.model || "default-model",
  provider: "mock-provider",
}));

mock.module("@/core/conversation", () => ({
  broadcaster: {
    findConversationIdByWs,
    removeConnection,
    getConnectionCount,
    hasConnection: mock(),
    addConnection: mock(),
    broadcast: mock(),
  },
  conversationRepository: {
    get: getConversation,
    getOrLoad,
    load: mock(),
  },
  conversationOrchestrator: {
    interrupt,
  },
}));

mock.module("@/core/messageResolver", () => ({
  getResolver,
}));

mock.module("@/core/model", () => ({
  getLlm,
}));

mock.module("@/utils/getSessions", () => ({
  getSessionHistories: mock(),
}));

const { ServerWebSocketMessageHandler } = await import("./webSocketMessageHandler");

beforeEach(() => {
  findConversationIdByWs.mockClear();
  removeConnection.mockClear();
  getConnectionCount.mockClear();
  getConversation.mockReset();
  getOrLoad.mockReset();
  interrupt.mockClear();
  getResolver.mockReset();
  getLlm.mockClear();
});

describe("ServerWebSocketMessageHandler.handleClose", () => {
  it("removes the socket without interrupting an active task when the last frontend connection closes", () => {
    getConversation.mockReturnValue({
      id: "task-1",
      status: "streaming",
    });
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

    expect(getLlm).toHaveBeenCalledWith({
      modelConfigSnapshot: {
        configId: "new-config",
        model: "new-model",
      },
      userId: "user-1",
    });
    expect(setLlm).toHaveBeenCalledWith({
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

    expect(getLlm).toHaveBeenCalledWith({
      modelConfigSnapshot: {
        configId: "new-config",
        model: "new-model",
      },
      userId: "user-1",
    });
    expect(setLlm).toHaveBeenCalledWith({
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

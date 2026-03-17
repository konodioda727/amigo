import { describe, expect, it, mock } from "bun:test";

const findConversationIdByWs = mock(() => "task-1");
const removeConnection = mock();
const getConnectionCount = mock(() => 0);
const getConversation = mock(() => ({
  id: "task-1",
  status: "streaming",
}));
const interrupt = mock();

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
    getOrLoad: mock(),
    load: mock(),
  },
  taskOrchestrator: {
    interrupt,
  },
}));

mock.module("@/core/messageResolver", () => ({
  getResolver: mock(),
}));

mock.module("@/utils/getSessions", () => ({
  getSessionHistories: mock(),
}));

const { ServerWebSocketMessageHandler } = await import("./webSocketMessageHandler");

describe("ServerWebSocketMessageHandler.handleClose", () => {
  it("removes the socket without interrupting an active task when the last frontend connection closes", () => {
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

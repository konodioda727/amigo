import { beforeEach, describe, expect, it, mock } from "bun:test";
import { logger } from "@/utils/logger";
import { taskOrchestrator } from "../TaskOrchestrator";

// Mock logger
mock.module("@/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
  },
}));

// Mock other dependencies to avoid runtime errors during import or execution
mock.module("@/core/model", () => ({
  getLlm: mock(),
}));

mock.module("@/core/conversation/ConversationRepository", () => ({
  conversationRepository: {
    get: mock(),
    getAll: mock(),
  },
}));

mock.module("@/core/conversation/WebSocketBroadcaster", () => ({
  broadcaster: {
    broadcast: mock(),
  },
}));

describe("TaskOrchestrator Interrupt Logic", () => {
  beforeEach(() => {
    // Reset mocks
    (logger.info as any).mockClear();
  });

  it("should not interrupt if status is aborted", () => {
    const conversation = {
      id: "test-id-aborted",
      status: "aborted",
      isAborted: true,
      memory: {
        addMessage: mock(),
        addWebsocketMessage: mock(),
      },
    } as any;

    taskOrchestrator.interrupt(conversation);

    expect(logger.info).toHaveBeenCalledWith("会话状态为 aborted，无需打断。");
  });

  it("should not interrupt if status is idle", () => {
    const conversation = {
      id: "test-id-idle",
      status: "idle",
      isAborted: false,
      memory: {
        addMessage: mock(),
        addWebsocketMessage: mock(),
      },
    } as any;

    taskOrchestrator.interrupt(conversation);

    expect(logger.info).toHaveBeenCalledWith("会话状态为 idle，无需打断。");
  });

  it("should not interrupt if status is completed", () => {
    const conversation = {
      id: "test-id-completed",
      status: "completed",
      isAborted: false,
      memory: {
        addMessage: mock(),
        addWebsocketMessage: mock(),
      },
    } as any;

    taskOrchestrator.interrupt(conversation);

    expect(logger.info).toHaveBeenCalledWith("会话状态为 completed，无需打断。");
  });
});

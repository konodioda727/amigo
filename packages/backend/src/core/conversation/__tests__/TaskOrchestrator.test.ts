import { beforeEach, describe, expect, it, mock } from "bun:test";
import { logger } from "@/utils/logger";
import { conversationRepository } from "../ConversationRepository";
import { resolveObservedSubTaskStatus, taskOrchestrator } from "../TaskOrchestrator";

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
    broadcastConversation: mock(),
  },
}));

describe("TaskOrchestrator Interrupt Logic", () => {
  beforeEach(() => {
    // Reset mocks
    (logger.info as any).mockClear();
    (conversationRepository.getAll as any).mockReturnValue([]);
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

    expect(logger.info).toHaveBeenCalledWith("会话状态为 idle，且没有运行中的子任务，无需打断。");
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

    expect(logger.info).toHaveBeenCalledWith(
      "会话状态为 completed，且没有运行中的子任务，无需打断。",
    );
  });

  it("should interrupt running children even if parent is idle", () => {
    const child = {
      id: "child-running",
      parentId: "parent-idle",
      status: "streaming",
      isAborted: false,
      userInput: "work",
      memory: {
        addMessage: mock(),
        addWebsocketMessage: mock(),
      },
    } as any;
    (conversationRepository.getAll as any).mockReturnValue([child]);

    const conversation = {
      id: "parent-idle",
      status: "idle",
      isAborted: false,
      userInput: "",
      memory: {
        addMessage: mock(),
        addWebsocketMessage: mock(),
      },
    } as any;

    taskOrchestrator.interrupt(conversation);

    expect(conversation.isAborted).toBe(true);
    expect(conversation.status).toBe("aborted");
    expect(child.isAborted).toBe(true);
    expect(child.status).toBe("aborted");
  });

  it("should set aborted flag when interrupting waiting_tool_confirmation", () => {
    const conversation = {
      id: "test-id-waiting",
      status: "waiting_tool_confirmation",
      isAborted: false,
      pendingToolCall: { toolName: "bash" },
      userInput: "confirm",
      memory: {
        addMessage: mock(),
        addWebsocketMessage: mock(),
      },
    } as any;

    taskOrchestrator.interrupt(conversation);

    expect(conversation.isAborted).toBe(true);
    expect(conversation.status).toBe("aborted");
    expect(conversation.pendingToolCall).toBeNull();
    expect(conversation.userInput).toBe("");
  });
});

describe("resolveObservedSubTaskStatus", () => {
  it("keeps wait_review sticky while still waiting for confirmation", () => {
    const status = resolveObservedSubTaskStatus({
      currentStatus: "waiting_tool_confirmation",
      pendingToolName: undefined,
      lastSyncedStatus: "wait_review",
      hasObservedActiveState: true,
    });

    expect(status).toBe("wait_review");
  });

  it("maps completeTask confirmation waits to wait_review", () => {
    const status = resolveObservedSubTaskStatus({
      currentStatus: "waiting_tool_confirmation",
      pendingToolName: "completeTask",
      lastSyncedStatus: "running",
      hasObservedActiveState: true,
    });

    expect(status).toBe("wait_review");
  });
});

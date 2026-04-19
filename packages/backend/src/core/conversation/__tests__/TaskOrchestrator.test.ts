import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { logger } from "@/utils/logger";
import { conversationRepository } from "../ConversationRepository";
import { broadcaster } from "../lifecycle/WebSocketBroadcaster";
import {
  conversationOrchestrator,
  resolveObservedExecutionTaskStatus,
} from "../orchestration/ConversationOrchestrator";

// Mock logger
mock.module("@/utils/logger", () => ({
  logger: {
    debug: mock(),
    info: mock(),
    warn: mock(),
    error: mock(),
  },
}));

const broadcast = mock();
const broadcastConversation = mock();
const getAll = mock(() => []);

const originalGetAll = conversationRepository.getAll.bind(conversationRepository);
const originalBroadcast = broadcaster.broadcast.bind(broadcaster);
const originalBroadcastConversation = broadcaster.broadcastConversation.bind(broadcaster);

describe("ConversationOrchestrator Interrupt Logic", () => {
  beforeEach(() => {
    // Reset mocks
    (logger.info as any).mockClear();
    getAll.mockReset();
    getAll.mockReturnValue([]);
    broadcast.mockClear();
    broadcastConversation.mockClear();
    conversationRepository.getAll = getAll as typeof conversationRepository.getAll;
    broadcaster.broadcast = broadcast as typeof broadcaster.broadcast;
    broadcaster.broadcastConversation =
      broadcastConversation as typeof broadcaster.broadcastConversation;
    (conversationOrchestrator as any).executors.clear();
  });

  afterEach(() => {
    conversationRepository.getAll = originalGetAll;
    broadcaster.broadcast = originalBroadcast;
    broadcaster.broadcastConversation = originalBroadcastConversation;
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

    conversationOrchestrator.interrupt(conversation);

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

    conversationOrchestrator.interrupt(conversation);

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

    conversationOrchestrator.interrupt(conversation);

    expect(logger.info).toHaveBeenCalledWith("会话状态为 completed，无需打断。");
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
    getAll.mockReturnValue([child]);

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

    conversationOrchestrator.interrupt(conversation);

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

    conversationOrchestrator.interrupt(conversation);

    expect(conversation.isAborted).toBe(true);
    expect(conversation.status).toBe("aborted");
    expect(conversation.pendingToolCall).toBeNull();
    expect(conversation.userInput).toBe("");
  });

  it("aborts the active detached tool runner when interrupting tool_executing conversations", () => {
    const controller = new AbortController();
    const clearAbortController = mock();
    (conversationOrchestrator as any).executors.set("tool-task", {
      getCurrentAbortController: () => controller,
      clearAbortController,
    });

    const conversation = {
      id: "tool-task",
      status: "tool_executing",
      isAborted: false,
      userInput: "",
      memory: {
        addMessage: mock(),
        addWebsocketMessage: mock(),
      },
    } as any;

    conversationOrchestrator.interrupt(conversation);

    expect(controller.signal.aborted).toBe(true);
    expect(clearAbortController).toHaveBeenCalledTimes(1);
    expect(conversation.isAborted).toBe(true);
    expect(conversation.status).toBe("aborted");
  });
});

describe("resolveObservedExecutionTaskStatus", () => {
  it("treats waiting_tool_confirmation as running while the execution task is active", () => {
    const status = resolveObservedExecutionTaskStatus({
      currentStatus: "waiting_tool_confirmation",
      hasObservedActiveState: true,
    });

    expect(status).toBe("running");
  });

  it("maps idle after active execution to interrupted", () => {
    const status = resolveObservedExecutionTaskStatus({
      currentStatus: "idle",
      hasObservedActiveState: true,
    });

    expect(status).toBe("interrupted");
  });
});

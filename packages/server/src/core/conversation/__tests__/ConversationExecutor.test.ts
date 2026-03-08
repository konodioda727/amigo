import { beforeEach, describe, expect, it, mock } from "bun:test";
import { ConversationExecutor } from "../ConversationExecutor";
import { broadcaster } from "../WebSocketBroadcaster";

mock.module("@/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

mock.module("@/core/conversation/WebSocketBroadcaster", () => ({
  broadcaster: {
    broadcast: mock(),
  },
}));

describe("ConversationExecutor waiting_tool_confirmation", () => {
  beforeEach(() => {
    (broadcaster.broadcast as ReturnType<typeof mock>).mockClear();
  });

  it("does not auto-complete sub tasks on non-confirm input", async () => {
    const executor = new ConversationExecutor();
    const executeToolCall = mock(async () => {});
    const handleStream = mock(async () => "message");
    const handleStreamCompletion = mock(async (conversation: any) => {
      conversation.status = "idle";
      return false;
    });
    const addMessage = mock();

    (executor as any).toolExecutor.executeToolCall = executeToolCall;
    (executor as any).streamHandler.handleStream = handleStream;
    (executor as any).completionHandler.handleStreamCompletion = handleStreamCompletion;

    const conversation = {
      id: "sub-task-reject",
      type: "sub",
      status: "waiting_tool_confirmation",
      isAborted: false,
      userInput: "先别提交，我补一句说明",
      pendingToolCall: {
        toolName: "completeTask",
        params: { result: "done" },
        toolCallId: "call-1",
        type: "tool",
        updateTime: 1,
      },
      memory: {
        addMessage,
      },
    } as any;

    await executor.execute(conversation);

    expect(executeToolCall).not.toHaveBeenCalled();
    expect(handleStream).toHaveBeenCalledTimes(1);
    expect(conversation.pendingToolCall).toBeNull();
    expect(conversation.status).toBe("idle");
    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "system",
        content: "用户取消了工具 'completeTask' 的执行。",
      }),
    );
  });

  it("still completes sub tasks after explicit confirm", async () => {
    const executor = new ConversationExecutor();
    const executeToolCall = mock(async () => {});

    (executor as any).toolExecutor.executeToolCall = executeToolCall;

    const conversation = {
      id: "sub-task-confirm",
      type: "sub",
      status: "waiting_tool_confirmation",
      isAborted: false,
      userInput: "confirm",
      pendingToolCall: {
        toolName: "completeTask",
        params: { result: "done" },
        toolCallId: "call-2",
        type: "tool",
        updateTime: 1,
      },
      memory: {
        addMessage: mock(),
      },
    } as any;

    await executor.execute(conversation);

    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(conversation.status).toBe("completed");
    expect(broadcaster.broadcast).toHaveBeenCalledWith("sub-task-confirm", {
      type: "conversationOver",
      data: {
        reason: "completeTask",
      },
    });
  });
});

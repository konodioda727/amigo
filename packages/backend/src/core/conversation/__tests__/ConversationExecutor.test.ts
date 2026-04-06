import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  clearConversationContinuations,
  enqueueConversationContinuation,
} from "../asyncContinuations";
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
    broadcastConversation: mock(),
  },
}));

describe("ConversationExecutor waiting_tool_confirmation", () => {
  beforeEach(() => {
    (broadcaster.broadcast as ReturnType<typeof mock>).mockClear();
    (broadcaster.broadcastConversation as ReturnType<typeof mock>).mockClear();
    clearConversationContinuations("sub-task-reject");
    clearConversationContinuations("sub-task-confirm");
    clearConversationContinuations("main-task-active-continuation");
  });

  it("does not auto-complete sub tasks on non-confirm input", async () => {
    const executor = new ConversationExecutor();
    const executeToolCall = mock(async () => {});
    const handleStream = mock(async () => "message");
    const handleStreamCompletion = mock(async (conversation: any) => {
      conversation.userInput = "";
      conversation.status = "idle";
      return { shouldContinue: false };
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
      toolService: {
        getToolFromName: mock(() => undefined),
      },
      memory: {
        addMessage: mock(),
      },
    } as any;

    await executor.execute(conversation);

    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(conversation.status).toBe("completed");
    expect(broadcaster.broadcastConversation).toHaveBeenCalledWith(conversation, {
      type: "conversationOver",
      data: {
        reason: "completeTask",
      },
    });
  });

  it("continues draining queued tool calls after confirming a pending tool", async () => {
    const executor = new ConversationExecutor();
    const executeToolCall = mock(async () => {});
    const processToolCalls = mock(async (conversation: any) => {
      conversation.status = "tool_executing";
      return "editFile";
    });
    const handleStreamCompletion = mock(async () => false);

    (executor as any).toolExecutor.executeToolCall = executeToolCall;
    (executor as any).streamHandler.processToolCalls = processToolCalls;
    (executor as any).completionHandler.handleStreamCompletion = handleStreamCompletion;

    const conversation = {
      id: "main-task-confirm-queue",
      type: "main",
      status: "waiting_tool_confirmation",
      isAborted: false,
      userInput: "confirm",
      pendingToolCall: {
        toolName: "bash",
        params: { command: "npm test" },
        toolCallId: "call-2",
        type: "tool",
        updateTime: 10,
        queuedToolCalls: [
          {
            toolName: "editFile",
            params: { filePath: "README.md", oldString: "a", newString: "b" },
            toolCallId: "call-3",
            type: "tool",
            updateTime: 11,
          },
        ],
      },
      toolService: {
        getToolFromName: mock(() => undefined),
      },
      memory: {
        addMessage: mock(),
      },
    } as any;

    await executor.execute(conversation);

    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(executeToolCall).toHaveBeenCalledWith(
      conversation,
      {
        toolCallId: "call-2",
        name: "bash",
        arguments: { command: "npm test" },
      },
      "tool",
      expect.any(AbortSignal),
      10,
    );
    expect(processToolCalls).toHaveBeenCalledWith(
      conversation,
      [
        {
          toolName: "editFile",
          params: { filePath: "README.md", oldString: "a", newString: "b" },
          toolCallId: "call-3",
          type: "tool",
          updateTime: 11,
        },
      ],
      expect.any(AbortSignal),
    );
    expect(handleStreamCompletion).toHaveBeenCalledWith(conversation, "editFile", false, null);
  });

  it("injects queued continuations before the next active loop turn without re-entering execute", async () => {
    const executor = new ConversationExecutor();
    const handleStream = mock(async (conversation: any) => {
      expect(conversation.memory.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "system",
          content: "依赖安装已完成。",
        }),
      );
      return "message";
    });
    const handleStreamCompletion = mock(async (conversation: any) => {
      conversation.userInput = "";
      conversation.status = "idle";
      return { shouldContinue: false };
    });

    (executor as any).streamHandler.handleStream = handleStream;
    (executor as any).completionHandler.handleStreamCompletion = handleStreamCompletion;

    const addMessage = mock();
    const conversation = {
      id: "main-task-active-continuation",
      type: "main",
      status: "idle",
      isAborted: false,
      userInput: "继续处理当前任务",
      pendingToolCall: null,
      memory: {
        addMessage,
      },
    } as any;

    enqueueConversationContinuation({
      conversation,
      reason: "dependency notification",
      run: async () => {
        throw new Error("idle run should not be used in active loop test");
      },
      injectBeforeNextTurn: (currentConversation) => {
        currentConversation.memory.addMessage({
          role: "system",
          content: "依赖安装已完成。",
          type: "system",
          partial: false,
        });
        currentConversation.userInput = "__amigo_internal_dependency_continuation__";
      },
    });

    await executor.execute(conversation);

    expect(handleStream).toHaveBeenCalledTimes(1);
    expect(handleStreamCompletion).toHaveBeenCalledTimes(1);
    expect(addMessage).toHaveBeenCalledTimes(1);
    expect(conversation.userInput).toBe("");
  });

  it("passes no-tool retry hints only to the next model request", async () => {
    const executor = new ConversationExecutor();
    const handleStream = mock(async () => "message");
    const handleStreamCompletion = mock()
      .mockResolvedValueOnce({
        shouldContinue: true,
        nextTurnMessages: [
          {
            role: "system",
            content: "上一条回复没有调用任何工具。",
            type: "message",
            partial: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        shouldContinue: false,
      });

    (executor as any).streamHandler.handleStream = handleStream;
    (executor as any).completionHandler.handleStreamCompletion = handleStreamCompletion;

    const conversation = {
      id: "main-task-ephemeral-retry",
      type: "main",
      status: "idle",
      isAborted: false,
      userInput: "继续",
      pendingToolCall: null,
      memory: {
        addMessage: mock(),
      },
    } as any;

    await executor.execute(conversation);

    expect(handleStream).toHaveBeenCalledTimes(2);
    expect(handleStream.mock.calls[0]?.[2]).toEqual([]);
    expect(handleStream.mock.calls[1]?.[2]).toEqual([
      expect.objectContaining({
        role: "system",
        content: "上一条回复没有调用任何工具。",
      }),
    ]);
    expect(conversation.memory.addMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        content: "上一条回复没有调用任何工具。",
      }),
    );
  });
});

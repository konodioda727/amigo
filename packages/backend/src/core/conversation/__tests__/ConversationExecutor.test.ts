import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  clearConversationContinuations,
  enqueueConversationContinuation,
} from "../context/asyncContinuations";
import { ConversationExecutor } from "../lifecycle/ConversationExecutor";
import { broadcaster } from "../lifecycle/WebSocketBroadcaster";

mock.module("@/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

mock.module("@/core/conversation/lifecycle/WebSocketBroadcaster", () => ({
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
    const handleStream = mock(async () => ({ currentTool: "message", toolCalls: [] }));
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
        role: "user",
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
      consumeLastCompleteTaskDisposition: mock(() => null),
      memory: {
        addMessage: mock(),
      },
    } as any;

    await executor.execute(conversation);
    await new Promise((resolve) => setTimeout(resolve, 0));

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
    await new Promise((resolve) => setTimeout(resolve, 0));

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
          role: "user",
          content: "依赖安装已完成。",
        }),
      );
      return { currentTool: "message", toolCalls: [] };
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
          role: "user",
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
    const handleStream = mock(async () => ({ currentTool: "message", toolCalls: [] }));
    const handleStreamCompletion = mock()
      .mockResolvedValueOnce({
        shouldContinue: true,
        nextTurnMessages: [
          {
            role: "user",
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
        role: "user",
        content: "上一条回复没有调用任何工具。",
      }),
    ]);
    expect(conversation.memory.addMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        content: "上一条回复没有调用任何工具。",
      }),
    );
  });

  it("dispatches streamed tool calls to the detached tool runner", async () => {
    const executor = new ConversationExecutor();
    const handleStream = mock(async () => ({
      currentTool: "readFile",
      toolCalls: [
        {
          toolName: "readFile",
          params: { filePath: "README.md" },
          toolCallId: "call-1",
          type: "tool",
          updateTime: 1,
        },
      ],
    }));
    let resolveProcessToolCalls: ((value: string) => void) | null = null;
    const processToolCalls = mock(
      () =>
        new Promise<string>((resolve) => {
          resolveProcessToolCalls = resolve;
        }),
    );
    const handleStreamCompletion = mock(async (conversation: any) => {
      conversation.status = "idle";
      conversation.userInput = "";
      return { shouldContinue: false };
    });

    (executor as any).streamHandler.handleStream = handleStream;
    (executor as any).streamHandler.processToolCalls = processToolCalls;
    (executor as any).completionHandler.handleStreamCompletion = handleStreamCompletion;

    const conversation = {
      id: "main-task-detached-tool-runner",
      type: "main",
      status: "idle",
      isAborted: false,
      userInput: "继续",
      pendingToolCall: null,
      memory: {
        addMessage: mock(),
      },
    } as any;

    const executePromise = executor.execute(conversation);
    await executePromise;

    expect(processToolCalls).toHaveBeenCalledWith(
      conversation,
      [
        {
          toolName: "readFile",
          params: { filePath: "README.md" },
          toolCallId: "call-1",
          type: "tool",
          updateTime: 1,
        },
      ],
      expect.any(AbortSignal),
    );
    expect(handleStreamCompletion).not.toHaveBeenCalled();
    expect(conversation.status).toBe("tool_executing");

    resolveProcessToolCalls?.("readFile");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handleStreamCompletion).toHaveBeenCalledWith(conversation, "readFile", false, null);
  });

  it("resets detached tool recovery status to streaming before retrying the loop", async () => {
    const executor = new ConversationExecutor();
    const processToolCalls = mock(async () => "readFile");
    const handleStreamCompletion = mock(async () => {
      throw new Error("completion failed after tool");
    });
    const handleStream = mock(async (conversation: any) => {
      expect(conversation.status).toBe("streaming");
      return { currentTool: "interrupt", toolCalls: [] };
    });

    (executor as any).streamHandler.processToolCalls = processToolCalls;
    (executor as any).completionHandler.handleStreamCompletion = handleStreamCompletion;
    (executor as any).streamHandler.handleStream = handleStream;

    const conversation = {
      id: "detached-tool-recovery",
      type: "main",
      status: "tool_executing",
      isAborted: false,
      pendingToolCall: null,
      currentWorkflowPhase: "execution",
      workflowAgentRole: "controller",
      workflowState: { mode: "phased" },
      toolService: {
        getToolFromName: mock(() => undefined),
      },
      memory: {
        addMessage: mock(),
      },
    } as any;

    await (executor as any).runDetachedToolExecution(
      conversation,
      [
        {
          toolName: "readFile",
          params: { filePaths: ["README.md"] },
          type: "tool",
          updateTime: 1,
        },
      ],
      new AbortController(),
      {
        onAbortedAfterTool: "aborted",
        onContinue: "continue",
        onStop: "stop",
      },
    );

    expect(processToolCalls).toHaveBeenCalledTimes(1);
    expect(handleStreamCompletion).toHaveBeenCalledTimes(1);
    expect(handleStream).toHaveBeenCalledTimes(1);
  });
});

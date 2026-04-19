import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Conversation } from "../Conversation";
import {
  buildAssistantToolCallMemoryMessage,
  buildToolResultMemoryMessage,
} from "../context/toolTranscript";
import { CompletionHandler } from "../lifecycle/CompletionHandler";
import { broadcaster } from "../lifecycle/WebSocketBroadcaster";

mock.module("@/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
  },
}));

mock.module("@/core/conversation/lifecycle/WebSocketBroadcaster", () => ({
  broadcaster: {
    broadcast: mock(),
    broadcastConversation: mock(),
  },
}));

describe("CompletionHandler abort guard", () => {
  beforeEach(() => {
    (broadcaster.broadcastConversation as ReturnType<typeof mock>).mockClear();
  });

  it("should stop immediately when conversation is aborted", async () => {
    const handler = new CompletionHandler();
    const conversation = {
      id: "task-1",
      type: "main",
      status: "aborted",
      isAborted: true,
      userInput: "input",
      memory: {
        addMessage: mock(),
      },
    } as unknown as Conversation;

    const completion = await handler.handleStreamCompletion(conversation, "message", false, null);

    expect(completion).toEqual({ shouldContinue: false });
    expect(conversation.status).toBe("aborted");
  });
});

describe("CompletionHandler default tool flow", () => {
  beforeEach(() => {
    (broadcaster.broadcastConversation as ReturnType<typeof mock>).mockClear();
  });

  it("should continue the loop after a tool execution error", async () => {
    const handler = new CompletionHandler();
    const addMessage = mock();
    const conversation = {
      id: "task-tool-error",
      type: "main",
      status: "tool_executing",
      isAborted: false,
      userInput: "input",
      toolService: {
        getToolFromName: mock(() => undefined),
      },
      memory: {
        addMessage,
      },
    } as unknown as Conversation;

    const completion = await handler.handleStreamCompletion(conversation, "renderLayout", true, {
      toolName: "renderLayout",
      error: "missing required field: source",
      type: "tool",
    });

    expect(completion).toEqual({ shouldContinue: true });
    expect(conversation.status).toBe("streaming");
    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "user",
        type: "tool",
        partial: false,
        content: expect.stringContaining("工具调用失败：renderLayout"),
      }),
    );
    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("优先修正并重试同一个工具"),
      }),
    );
  });

  it("pushes execution-phase tool failures toward retrying the same tool instead of switching paths", async () => {
    const handler = new CompletionHandler();
    const addMessage = mock();
    const conversation = {
      id: "task-tool-error-execution",
      type: "main",
      status: "tool_executing",
      isAborted: false,
      userInput: "input",
      currentWorkflowPhase: "execution",
      workflowAgentRole: "controller",
      toolService: {
        getToolFromName: mock(() => undefined),
      },
      memory: {
        addMessage,
      },
    } as unknown as Conversation;

    const completion = await handler.handleStreamCompletion(conversation, "editFile", true, {
      toolName: "editFile",
      error: "工具 'editFile' 缺少必需参数: newString",
      type: "tool",
    });

    expect(completion).toEqual({ shouldContinue: true });
    expect(conversation.status).toBe("streaming");
    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("不要因为这次失败退回大量读取或改走别的实现路径"),
      }),
    );
    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("重试同一个工具"),
      }),
    );
  });

  it("should keep streaming after non-terminal tool execution", async () => {
    const handler = new CompletionHandler();
    const conversation = {
      id: "task-2",
      type: "main",
      status: "tool_executing",
      isAborted: false,
      userInput: "input",
      currentWorkflowPhase: "design",
      workflowAgentRole: "controller",
      toolService: {
        getToolFromName: mock(() => undefined),
      },
      memory: {
        messages: [],
        addMessage: mock(),
      },
    } as unknown as Conversation;

    const completion = await handler.handleStreamCompletion(conversation, "bash", false, null);

    expect(completion).toEqual({ shouldContinue: true });
    expect(conversation.status).toBe("streaming");
  });

  it("re-announces the current workflow state after a phase-completing finishPhase", async () => {
    const handler = new CompletionHandler();
    const setWorkflowState = mock();
    const conversation = {
      id: "task-phase-complete",
      type: "main",
      status: "tool_executing",
      isAborted: false,
      userInput: "input",
      workflowState: {
        currentPhase: "discovery",
        agentRole: "controller",
      },
      consumeLastFinishPhaseDisposition: mock(() => "phase_advanced"),
      setWorkflowState,
      toolService: {
        getToolFromName: mock(() => undefined),
      },
      memory: {
        addMessage: mock(),
      },
    } as unknown as Conversation;

    const completion = await handler.handleStreamCompletion(
      conversation,
      "finishPhase",
      false,
      null,
    );

    expect(completion).toEqual({ shouldContinue: true });
    expect(setWorkflowState).toHaveBeenCalledWith(conversation.workflowState, {
      announce: true,
      forceAnnouncement: true,
    });
    expect(conversation.status).toBe("streaming");
  });

  it("injects loop guidance after consecutive reads without progress", async () => {
    const handler = new CompletionHandler();
    const conversation = {
      id: "task-loop-guidance",
      type: "main",
      status: "tool_executing",
      isAborted: false,
      userInput: "input",
      currentWorkflowPhase: "discovery",
      workflowAgentRole: "controller",
      toolService: {
        getToolFromName: mock(() => undefined),
      },
      memory: {
        addMessage: mock(),
        messages: [
          buildAssistantToolCallMemoryMessage({
            toolCallId: "call-1",
            toolName: "listFiles",
            arguments: { directoryPath: "/repo/src" },
          }),
          buildToolResultMemoryMessage({
            toolCallId: "call-1",
            toolName: "listFiles",
            result: { directoryPath: "/repo/src" },
            summary: "src 已列出",
          }),
          buildAssistantToolCallMemoryMessage({
            toolCallId: "call-2",
            toolName: "readFile",
            arguments: { filePaths: ["README.md"] },
          }),
          buildToolResultMemoryMessage({
            toolCallId: "call-2",
            toolName: "readFile",
            result: { filePaths: ["README.md"] },
            summary: "README 已读取",
          }),
          buildAssistantToolCallMemoryMessage({
            toolCallId: "call-3",
            toolName: "readFile",
            arguments: { filePaths: ["package.json"] },
          }),
          buildToolResultMemoryMessage({
            toolCallId: "call-3",
            toolName: "readFile",
            result: { filePaths: ["package.json"] },
            summary: "package.json 已读取",
          }),
          buildAssistantToolCallMemoryMessage({
            toolCallId: "call-4",
            toolName: "browserSearch",
            arguments: { query: "test query" },
          }),
          buildToolResultMemoryMessage({
            toolCallId: "call-4",
            toolName: "browserSearch",
            result: { query: "test query" },
            summary: "搜索完成",
          }),
          buildAssistantToolCallMemoryMessage({
            toolCallId: "call-5",
            toolName: "listFiles",
            arguments: { directoryPath: "/repo/tests" },
          }),
          buildToolResultMemoryMessage({
            toolCallId: "call-5",
            toolName: "listFiles",
            result: { directoryPath: "/repo/tests" },
            summary: "tests 已列出",
          }),
        ],
      },
    } as unknown as Conversation;

    const completion = await handler.handleStreamCompletion(conversation, "readFile", false, null);

    expect(completion.shouldContinue).toBe(true);
    expect(completion.nextTurnMessages).toEqual([
      {
        role: "user",
        type: "message",
        partial: false,
        content:
          "你已经连续 5 次使用读取/搜索类工具（listFiles、readFile、browserSearch），但还没有推进任务状态。不要继续只读空转；如果执行方案已经清楚，下一步直接调用 taskList（action=execute，必要时连 tasks 一起传入），或进入 editFile / bash / finishPhase。",
      },
    ]);
    expect(conversation.status).toBe("streaming");
  });

  it("should stop after idle custom tool execution", async () => {
    const handler = new CompletionHandler();
    const conversation = {
      id: "task-3",
      type: "main",
      status: "tool_executing",
      isAborted: false,
      userInput: "input",
      toolService: {
        getToolFromName: mock(() => ({
          name: "customAsk",
          completionBehavior: "idle",
        })),
      },
      memory: {
        addMessage: mock(),
      },
    } as unknown as Conversation;

    const completion = await handler.handleStreamCompletion(conversation, "customAsk", false, null);

    expect(completion).toEqual({ shouldContinue: false });
    expect(conversation.status).toBe("idle");
    expect(conversation.userInput).toBe("");
    expect(broadcaster.broadcastConversation).toHaveBeenCalledWith(conversation, {
      type: "conversationOver",
      data: {
        reason: "tool",
      },
    });
  });

  it("should preserve askFollowupQuestion conversationOver reason", async () => {
    const handler = new CompletionHandler();
    const conversation = {
      id: "task-4",
      type: "main",
      status: "tool_executing",
      isAborted: false,
      userInput: "input",
      toolService: {
        getToolFromName: mock(() => ({
          name: "askFollowupQuestion",
          completionBehavior: "idle",
        })),
      },
      memory: {
        addMessage: mock(),
      },
    } as unknown as Conversation;

    const completion = await handler.handleStreamCompletion(
      conversation,
      "askFollowupQuestion",
      false,
      null,
    );

    expect(completion).toEqual({ shouldContinue: false });
    expect(conversation.status).toBe("idle");
    expect(broadcaster.broadcastConversation).toHaveBeenCalledWith(conversation, {
      type: "conversationOver",
      data: {
        reason: "askFollowupQuestion",
      },
    });
  });

  it("injects a specific tool-selection reminder only into the next main-task turn", async () => {
    const handler = new CompletionHandler();
    const addMessage = mock();
    const conversation = {
      id: "task-5",
      type: "main",
      status: "streaming",
      isAborted: false,
      userInput: "input",
      currentWorkflowPhase: "requirements",
      workflowAgentRole: "controller",
      toolService: {
        getToolFromName: mock(() => undefined),
      },
      memory: {
        addMessage,
      },
    } as unknown as Conversation;

    const completion = await handler.handleStreamCompletion(conversation, "message", false, null);

    expect(completion.shouldContinue).toBe(true);
    expect(completion.nextTurnMessages).toEqual([
      expect.objectContaining({
        role: "user",
        type: "message",
        partial: false,
        content: expect.stringContaining("上一条回复没有调用任何工具。"),
      }),
    ]);
    expect(conversation.status).toBe("streaming");
    expect(addMessage).not.toHaveBeenCalled();
  });

  it("should ask verification reviewer to use a tool instead of finishing with plain text", async () => {
    const handler = new CompletionHandler();
    const conversation = {
      id: "task-reviewer",
      type: "main",
      status: "streaming",
      isAborted: false,
      userInput: "input",
      workflowAgentRole: "verification_reviewer",
      currentWorkflowPhase: "verification",
      toolService: {
        getToolFromName: mock(() => undefined),
        getToolDefinitions: mock(() => [
          { name: "readFile" },
          { name: "bash" },
          { name: "submitTaskReview" },
        ]),
      },
      memory: {
        addMessage: mock(),
      },
    } as unknown as Conversation;

    const completion = await handler.handleStreamCompletion(conversation, "message", false, null);

    expect(completion.shouldContinue).toBe(true);
    expect(completion.nextTurnMessages).toEqual([
      expect.objectContaining({
        role: "user",
        type: "message",
        partial: false,
        content: expect.stringContaining("上一条回复没有调用任何工具。"),
      }),
    ]);
    expect(conversation.status).toBe("streaming");
  });
});

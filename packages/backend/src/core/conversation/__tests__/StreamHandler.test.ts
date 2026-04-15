import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setGlobalState } from "@/globalState";
import { contextCompressionManager } from "../context/ContextCompressionManager";
import { StreamHandler } from "../lifecycle/StreamHandler";
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
    postMessage: mock(),
    emitAndSave: mock(),
  },
}));

describe("StreamHandler", () => {
  afterEach(() => {
    const cacheRoot = setGlobalState("globalCachePath", undefined as never);
    void cacheRoot;
    setGlobalState("conversationPersistenceProvider", undefined);
  });

  it("drops trailing text deltas after a tool call starts and returns collected tool calls", async () => {
    const prepareMessages = mock(async () => []);
    const syncContextUsage = mock();
    (contextCompressionManager as any).prepareMessages = prepareMessages;
    (contextCompressionManager as any).syncContextUsage = syncContextUsage;

    const executeToolCall = mock(async () => {});
    const handler = new StreamHandler({
      resetToolError: mock(),
      executeToolCall,
    } as any);

    const postMessage = broadcaster.postMessage as ReturnType<typeof mock>;
    const emitAndSave = broadcaster.emitAndSave as ReturnType<typeof mock>;
    postMessage.mockClear();
    emitAndSave.mockClear();

    const conversation = {
      id: "stream-handler-tool-tail",
      type: "main",
      status: "streaming",
      isAborted: false,
      memory: {
        autoApproveToolNames: ["renderLayout"],
        addWebsocketMessage: mock(),
      },
      llm: {
        model: "test-model",
        stream: mock(async function* () {
          yield { type: "reasoning_delta", text: "先想一下" };
          yield { type: "text_delta", text: "正常正文" };
          yield {
            type: "tool_call_delta",
            name: "renderLayout",
            toolCallId: "call-1",
            partialArguments: { source: "<div>ok</div>" },
          };
          yield { type: "text_delta", text: "n" };
          yield { type: "reasoning_delta", text: "这段不该再出现" };
          yield {
            type: "tool_call_done",
            name: "renderLayout",
            toolCallId: "call-1",
            arguments: { source: "<div>ok</div>" },
          };
        }),
      },
      toolService: {
        getToolDefinitions: () => [],
      },
    } as any;

    const result = await handler.handleStream(conversation, new AbortController());

    expect(result.currentTool).toBe("renderLayout");
    expect(result.toolCalls).toEqual([
      expect.objectContaining({
        toolName: "renderLayout",
        params: { source: "<div>ok</div>" },
        toolCallId: "call-1",
        type: "tool",
      }),
    ]);
    expect(prepareMessages).toHaveBeenCalledTimes(1);
    expect(syncContextUsage).toHaveBeenCalledTimes(1);
    expect(emitAndSave).toHaveBeenCalledWith(
      conversation,
      expect.objectContaining({
        type: "think",
        data: expect.objectContaining({
          message: "先想一下",
          partial: false,
        }),
      }),
    );
    expect(postMessage).toHaveBeenCalledWith(
      conversation,
      expect.objectContaining({
        content: "正常正文",
        partial: false,
        type: "message",
      }),
    );
    expect(postMessage).not.toHaveBeenCalledWith(
      conversation,
      expect.objectContaining({
        content: "正常正文n",
      }),
    );
    expect(postMessage).not.toHaveBeenCalledWith(
      conversation,
      expect.objectContaining({
        content: "n",
      }),
    );
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("records the outgoing model context snapshot before streaming", async () => {
    const tempCacheRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-stream-context-"));
    const recordModelContextSnapshot = mock();
    setGlobalState("globalCachePath", tempCacheRoot);
    setGlobalState("conversationPersistenceProvider", {
      exists: () => false,
      load: () => null,
      save: () => true,
      delete: () => true,
      listConversationRelations: () => [],
      listSessionHistories: () => [],
      recordModelContextSnapshot,
    });

    const prepareMessages = mock(async () => [
      { role: "system", content: "SYSTEM" },
      { role: "user", content: "USER" },
    ]);
    const syncContextUsage = mock();
    (contextCompressionManager as any).prepareMessages = prepareMessages;
    (contextCompressionManager as any).syncContextUsage = syncContextUsage;

    const handler = new StreamHandler({
      resetToolError: mock(),
      executeToolCall: mock(async () => {}),
    } as any);

    const conversation = {
      id: "stream-handler-context-snapshot",
      parentId: "parent-task",
      status: "streaming",
      isAborted: false,
      currentWorkflowPhase: "execution",
      workflowAgentRole: "execution_worker",
      memory: {
        autoApproveToolNames: [],
        addWebsocketMessage: mock(),
      },
      llm: {
        model: "test-model",
        provider: "test-provider",
        stream: mock(async function* () {
          yield { type: "text_delta", text: "done" };
        }),
      },
      toolService: {
        getToolDefinitions: () => [{ name: "taskList" }],
      },
    } as any;

    await handler.handleStream(conversation, new AbortController());

    expect(recordModelContextSnapshot).toHaveBeenCalledTimes(1);
    expect(recordModelContextSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "stream-handler-context-snapshot",
        conversationType: "sub",
        workflowPhase: "execution",
        agentRole: "execution_worker",
        toolNames: ["taskList"],
        messageCount: 2,
      }),
    );

    rmSync(tempCacheRoot, { recursive: true, force: true });
  });

  it("collects multiple tool calls in one streamed turn without executing them immediately", async () => {
    const prepareMessages = mock(async () => []);
    const syncContextUsage = mock();
    (contextCompressionManager as any).prepareMessages = prepareMessages;
    (contextCompressionManager as any).syncContextUsage = syncContextUsage;

    const executeToolCall = mock(async () => {});
    const handler = new StreamHandler({
      resetToolError: mock(),
      executeToolCall,
    } as any);

    const conversation = {
      id: "stream-handler-multi-tool",
      type: "main",
      status: "streaming",
      isAborted: false,
      pendingToolCall: null,
      memory: {
        autoApproveToolNames: ["readFile", "editFile"],
        addWebsocketMessage: mock(),
      },
      llm: {
        model: "test-model",
        stream: mock(async function* () {
          yield {
            type: "tool_call_delta",
            name: "readFile",
            toolCallId: "call-1",
            partialArguments: { filePath: "README.md" },
          };
          yield {
            type: "tool_call_delta",
            name: "editFile",
            toolCallId: "call-2",
            partialArguments: { filePath: "README.md", oldString: "a", newString: "b" },
          };
          yield {
            type: "tool_call_done",
            name: "readFile",
            toolCallId: "call-1",
            arguments: { filePath: "README.md" },
          };
          yield {
            type: "tool_call_done",
            name: "editFile",
            toolCallId: "call-2",
            arguments: { filePath: "README.md", oldString: "a", newString: "b" },
          };
        }),
      },
      toolService: {
        getToolDefinitions: () => [],
      },
    } as any;

    const result = await handler.handleStream(conversation, new AbortController());

    expect(result.currentTool).toBe("editFile");
    expect(result.toolCalls).toEqual([
      expect.objectContaining({
        toolName: "readFile",
        params: { filePath: "README.md" },
        toolCallId: "call-1",
      }),
      expect.objectContaining({
        toolName: "editFile",
        params: { filePath: "README.md", oldString: "a", newString: "b" },
        toolCallId: "call-2",
      }),
    ]);
    expect(executeToolCall).not.toHaveBeenCalled();
    expect(conversation.status).toBe("streaming");
    expect(conversation.pendingToolCall).toBeNull();
  });

  it("executes multiple auto-approved tool calls when the detached runner drains the queue", async () => {
    const executeToolCall = mock(async () => {});
    const handler = new StreamHandler({
      resetToolError: mock(),
      executeToolCall,
    } as any);

    const conversation = {
      id: "stream-handler-process-tool-queue",
      type: "main",
      status: "tool_executing",
      isAborted: false,
      pendingToolCall: null,
      memory: {
        autoApproveToolNames: ["readFile", "editFile"],
        addWebsocketMessage: mock(),
      },
    } as any;

    const currentTool = await handler.processToolCalls(
      conversation,
      [
        {
          toolName: "readFile",
          params: { filePath: "README.md" },
          toolCallId: "call-1",
          type: "tool",
          updateTime: 1,
        },
        {
          toolName: "editFile",
          params: { filePath: "README.md", oldString: "a", newString: "b" },
          toolCallId: "call-2",
          type: "tool",
          updateTime: 2,
        },
      ],
      new AbortController().signal,
    );

    expect(currentTool).toBe("editFile");
    expect(executeToolCall).toHaveBeenCalledTimes(2);
    expect(executeToolCall).toHaveBeenNthCalledWith(
      1,
      conversation,
      {
        toolCallId: "call-1",
        name: "readFile",
        arguments: { filePath: "README.md" },
      },
      "tool",
      expect.any(AbortSignal),
      expect.any(Number),
    );
    expect(executeToolCall).toHaveBeenNthCalledWith(
      2,
      conversation,
      {
        toolCallId: "call-2",
        name: "editFile",
        arguments: { filePath: "README.md", oldString: "a", newString: "b" },
      },
      "tool",
      expect.any(AbortSignal),
      expect.any(Number),
    );
    expect(conversation.status).toBe("tool_executing");
    expect(conversation.pendingToolCall).toBeNull();
  });

  it("runs consecutive auto-approved read-only tool calls in parallel", async () => {
    let resolveReadFile: (() => void) | undefined;
    let resolveListFiles: (() => void) | undefined;
    const executeToolCall = mock(
      async (_conversation: unknown, toolCall: { name: string }) =>
        await new Promise<void>((resolve) => {
          if (toolCall.name === "readFile") {
            resolveReadFile = resolve;
            return;
          }
          if (toolCall.name === "listFiles") {
            resolveListFiles = resolve;
            return;
          }
          resolve();
        }),
    );
    const handler = new StreamHandler({
      resetToolError: mock(),
      executeToolCall,
    } as any);

    const conversation = {
      id: "stream-handler-parallel-safe-tools",
      type: "main",
      status: "tool_executing",
      isAborted: false,
      pendingToolCall: null,
      memory: {
        autoApproveToolNames: ["readFile", "listFiles"],
        addWebsocketMessage: mock(),
      },
    } as any;

    const processPromise = handler.processToolCalls(
      conversation,
      [
        {
          toolName: "readFile",
          params: { filePath: "README.md" },
          toolCallId: "call-1",
          type: "tool",
          updateTime: 1,
        },
        {
          toolName: "listFiles",
          params: { path: "src" },
          toolCallId: "call-2",
          type: "tool",
          updateTime: 2,
        },
      ],
      new AbortController().signal,
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(executeToolCall).toHaveBeenCalledTimes(2);

    resolveReadFile?.();
    await Promise.resolve();
    resolveListFiles?.();

    const currentTool = await processPromise;
    expect(currentTool).toBe("listFiles");
  });

  it("keeps write-affecting tool queues sequential even if multiple tools are auto-approved", async () => {
    let resolveReadFile: (() => void) | undefined;
    const executeToolCall = mock(
      async (_conversation: unknown, toolCall: { name: string }) =>
        await new Promise<void>((resolve) => {
          if (toolCall.name === "readFile") {
            resolveReadFile = resolve;
            return;
          }
          resolve();
        }),
    );
    const handler = new StreamHandler({
      resetToolError: mock(),
      executeToolCall,
    } as any);

    const conversation = {
      id: "stream-handler-sequential-write-tools",
      type: "main",
      status: "tool_executing",
      isAborted: false,
      pendingToolCall: null,
      memory: {
        autoApproveToolNames: ["readFile", "editFile"],
        addWebsocketMessage: mock(),
      },
    } as any;

    const processPromise = handler.processToolCalls(
      conversation,
      [
        {
          toolName: "readFile",
          params: { filePath: "README.md" },
          toolCallId: "call-1",
          type: "tool",
          updateTime: 1,
        },
        {
          toolName: "editFile",
          params: { filePath: "README.md", oldString: "a", newString: "b" },
          toolCallId: "call-2",
          type: "tool",
          updateTime: 2,
        },
      ],
      new AbortController().signal,
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(executeToolCall).toHaveBeenNthCalledWith(
      1,
      conversation,
      {
        toolCallId: "call-1",
        name: "readFile",
        arguments: { filePath: "README.md" },
      },
      "tool",
      expect.any(AbortSignal),
      expect.any(Number),
    );

    resolveReadFile?.();
    const currentTool = await processPromise;

    expect(currentTool).toBe("editFile");
    expect(executeToolCall).toHaveBeenCalledTimes(2);
  });

  it("allows user-defined tools marked as parallel_readonly to run in parallel", async () => {
    let resolveToolOne: (() => void) | undefined;
    let resolveToolTwo: (() => void) | undefined;
    const executeToolCall = mock(
      async (_conversation: unknown, toolCall: { name: string }) =>
        await new Promise<void>((resolve) => {
          if (toolCall.name === "customReadA") {
            resolveToolOne = resolve;
            return;
          }
          if (toolCall.name === "customReadB") {
            resolveToolTwo = resolve;
            return;
          }
          resolve();
        }),
    );
    const handler = new StreamHandler({
      resetToolError: mock(),
      executeToolCall,
    } as any);

    const conversation = {
      id: "stream-handler-custom-parallel-tools",
      type: "main",
      status: "tool_executing",
      isAborted: false,
      pendingToolCall: null,
      currentWorkflowPhase: "design",
      workflowAgentRole: "controller",
      toolService: {
        getToolFromName: (name: string) =>
          name === "customReadA" || name === "customReadB"
            ? {
                name,
                executionMode: "parallel_readonly",
                completionBehavior: "continue",
              }
            : undefined,
      },
      memory: {
        autoApproveToolNames: ["customReadA", "customReadB"],
        addWebsocketMessage: mock(),
      },
    } as any;

    const processPromise = handler.processToolCalls(
      conversation,
      [
        {
          toolName: "customReadA",
          params: { query: "a" },
          toolCallId: "call-1",
          type: "tool",
          updateTime: 1,
        },
        {
          toolName: "customReadB",
          params: { query: "b" },
          toolCallId: "call-2",
          type: "tool",
          updateTime: 2,
        },
      ],
      new AbortController().signal,
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(executeToolCall).toHaveBeenCalledTimes(2);

    resolveToolOne?.();
    await Promise.resolve();
    resolveToolTwo?.();

    const currentTool = await processPromise;
    expect(currentTool).toBe("customReadB");
  });

  it("pauses on the first confirmation-required tool and keeps the remaining queue", async () => {
    const executeToolCall = mock(async () => {});
    const handler = new StreamHandler({
      resetToolError: mock(),
      executeToolCall,
    } as any);

    const broadcastConversation = broadcaster.broadcastConversation as ReturnType<typeof mock>;
    broadcastConversation.mockClear();

    const conversation = {
      id: "stream-handler-confirmation-queue",
      type: "main",
      status: "tool_executing",
      isAborted: false,
      pendingToolCall: null,
      memory: {
        autoApproveToolNames: ["readFile"],
        addWebsocketMessage: mock(),
      },
    } as any;

    const currentTool = await handler.processToolCalls(
      conversation,
      [
        {
          toolName: "readFile",
          params: { filePath: "README.md" },
          toolCallId: "call-1",
          type: "tool",
          updateTime: 1,
        },
        {
          toolName: "bash",
          params: { command: "npm test" },
          toolCallId: "call-2",
          type: "tool",
          updateTime: 2,
        },
        {
          toolName: "editFile",
          params: { filePath: "README.md", oldString: "a", newString: "b" },
          toolCallId: "call-3",
          type: "tool",
          updateTime: 3,
        },
      ],
      new AbortController().signal,
    );

    expect(currentTool).toBe("bash");
    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(executeToolCall).toHaveBeenNthCalledWith(
      1,
      conversation,
      {
        toolCallId: "call-1",
        name: "readFile",
        arguments: { filePath: "README.md" },
      },
      "tool",
      expect.any(AbortSignal),
      expect.any(Number),
    );
    expect(conversation.status).toBe("waiting_tool_confirmation");
    expect(conversation.pendingToolCall).toEqual(
      expect.objectContaining({
        toolName: "bash",
        params: { command: "npm test" },
        toolCallId: "call-2",
        queuedToolCalls: [
          expect.objectContaining({
            toolName: "editFile",
            params: { filePath: "README.md", oldString: "a", newString: "b" },
            toolCallId: "call-3",
          }),
        ],
      }),
    );
    expect(broadcastConversation).toHaveBeenCalledWith(
      conversation,
      expect.objectContaining({
        type: "waiting_tool_call",
        data: expect.objectContaining({
          toolName: "bash",
          params: { command: "npm test" },
        }),
      }),
    );
  });
});

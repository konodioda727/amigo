import { describe, expect, it, mock } from "bun:test";
import { contextCompressionManager } from "../ContextCompressionManager";
import { StreamHandler } from "../StreamHandler";
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
    postMessage: mock(),
    emitAndSave: mock(),
  },
}));

describe("StreamHandler", () => {
  it("drops trailing text deltas after a tool call starts", async () => {
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

    const currentTool = await handler.handleStream(conversation, new AbortController());

    expect(currentTool).toBe("renderLayout");
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
    expect(executeToolCall).toHaveBeenCalledWith(
      conversation,
      expect.objectContaining({
        name: "renderLayout",
        arguments: { source: "<div>ok</div>" },
      }),
      "tool",
      expect.any(AbortSignal),
      expect.any(Number),
    );
  });

  it("executes multiple auto-approved tool calls in the same streamed turn", async () => {
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

    const currentTool = await handler.handleStream(conversation, new AbortController());

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

  it("pauses on the first confirmation-required tool and keeps the remaining queue", async () => {
    const prepareMessages = mock(async () => []);
    const syncContextUsage = mock();
    (contextCompressionManager as any).prepareMessages = prepareMessages;
    (contextCompressionManager as any).syncContextUsage = syncContextUsage;

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
      status: "streaming",
      isAborted: false,
      pendingToolCall: null,
      memory: {
        autoApproveToolNames: ["readFile"],
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
            name: "bash",
            toolCallId: "call-2",
            partialArguments: { command: "npm test" },
          };
          yield {
            type: "tool_call_delta",
            name: "editFile",
            toolCallId: "call-3",
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
            name: "bash",
            toolCallId: "call-2",
            arguments: { command: "npm test" },
          };
          yield {
            type: "tool_call_done",
            name: "editFile",
            toolCallId: "call-3",
            arguments: { filePath: "README.md", oldString: "a", newString: "b" },
          };
        }),
      },
      toolService: {
        getToolDefinitions: () => [],
      },
    } as any;

    const currentTool = await handler.handleStream(conversation, new AbortController());

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

import { describe, expect, it, mock } from "bun:test";
import { ToolExecutor } from "../ToolExecutor";
import { broadcaster } from "../WebSocketBroadcaster";

mock.module("@/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

mock.module("../WebSocketBroadcaster", () => ({
  broadcaster: {
    broadcast: mock(),
    broadcastConversation: mock(),
    postMessage: mock(),
    emitAndSave: mock(),
    persistMessageOnly: mock(),
  },
}));

describe("ToolExecutor", () => {
  it("keeps toolResult in the websocket payload when a tool returns error", async () => {
    const executor = new ToolExecutor();
    const addMessage = mock();
    const addWebsocketMessage = mock();
    const conversation = {
      id: "task-tool-error-payload",
      type: "main",
      parentId: undefined,
      isAborted: false,
      status: "tool_executing",
      memory: {
        addMessage,
        context: {},
        addWebsocketMessage,
      },
      toolService: {
        executeToolCall: mock(async () => ({
          message: "布局校验失败",
          params: { options: [] },
          toolResult: {
            success: false,
            validationErrors: ["缺少这些模块: footer"],
            message: "布局校验失败",
          },
          error: "缺少这些模块: footer",
        })),
      },
    } as any;

    const broadcast = broadcaster.broadcast as ReturnType<typeof mock>;
    broadcast.mockClear();

    await executor.executeToolCall(
      conversation,
      {
        name: "upsertLayoutOptions",
        arguments: { options: [] },
        toolCallId: "call-1",
      },
      "tool",
    );

    expect(broadcast).toHaveBeenCalledTimes(2);
    const finalPayload = broadcast.mock.calls[1]?.[1];
    const parsed = JSON.parse(String(finalPayload?.data?.message));
    expect(parsed.error).toBe("缺少这些模块: footer");
    expect(parsed.result).toEqual({
      success: false,
      validationErrors: ["缺少这些模块: footer"],
      message: "布局校验失败",
    });
    expect(finalPayload?.data?.partial).toBe(false);
    expect(addMessage).toHaveBeenCalledTimes(2);
  });

  it("stores main-task tool history as transcript messages and prefers continuation payloads", async () => {
    const executor = new ToolExecutor();
    const addMessage = mock();
    const addWebsocketMessage = mock();
    const conversation = {
      id: "task-main-transcript",
      type: "main",
      parentId: undefined,
      isAborted: false,
      status: "tool_executing",
      memory: {
        addMessage,
        context: {},
        addWebsocketMessage,
      },
      toolService: {
        executeToolCall: mock(async () => ({
          message: "成功读取 1 个文件",
          params: { filePaths: ["README.md"] },
          toolResult: {
            success: true,
            files: [
              {
                filePath: "README.md",
                content: "transport content",
              },
            ],
          },
          continuationResult: {
            success: true,
            filePaths: ["README.md"],
          },
          continuationSummary: "README 已读取",
        })),
      },
    } as any;

    await executor.executeToolCall(
      conversation,
      {
        name: "readFile",
        arguments: { filePaths: ["README.md"] },
        toolCallId: "call-main-1",
      },
      "tool",
    );

    expect(addMessage).toHaveBeenCalledTimes(2);
    expect(addMessage.mock.calls[0]?.[0]).toMatchObject({
      role: "assistant",
      type: "tool",
      partial: false,
    });
    expect(String(addMessage.mock.calls[0]?.[0]?.content)).toContain(
      '"kind":"assistant_tool_call"',
    );
    expect(String(addMessage.mock.calls[0]?.[0]?.content)).toContain('"toolName":"readFile"');

    expect(addMessage.mock.calls[1]?.[0]).toMatchObject({
      role: "user",
      type: "tool",
      partial: false,
    });
    expect(String(addMessage.mock.calls[1]?.[0]?.content)).toContain('"kind":"tool_result"');
    expect(String(addMessage.mock.calls[1]?.[0]?.content)).toContain('"summary":"README 已读取"');
    expect(String(addMessage.mock.calls[1]?.[0]?.content)).toContain('"filePaths":["README.md"]');
    expect(String(addMessage.mock.calls[1]?.[0]?.content)).not.toContain("transport content");
  });
});

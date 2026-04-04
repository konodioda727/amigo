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
    const addWebsocketMessage = mock();
    const conversation = {
      id: "task-tool-error-payload",
      parentId: undefined,
      isAborted: false,
      status: "tool_executing",
      memory: {
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
  });
});

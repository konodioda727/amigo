import { describe, expect, it, mock } from "bun:test";
import { ToolExecutor } from "../lifecycle/ToolExecutor";
import { broadcaster } from "../lifecycle/WebSocketBroadcaster";

mock.module("@/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

mock.module("../lifecycle/WebSocketBroadcaster", () => ({
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
      workflowAgentRole: "controller",
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
      workflowAgentRole: "controller",
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

  it("stores execution-worker finishPhase history as transcript messages", async () => {
    const executor = new ToolExecutor();
    const addMessage = mock();
    const addWebsocketMessage = mock();
    const conversation = {
      id: "task-execution-transcript",
      type: "sub",
      parentId: "task-main",
      isAborted: false,
      status: "tool_executing",
      workflowAgentRole: "execution_worker",
      memory: {
        addMessage,
        context: {},
        addWebsocketMessage,
      },
      toolService: {
        executeToolCall: mock(async () => ({
          message: "执行完成",
          params: {
            summary: "修复已完成",
            result:
              "## 交付物\n已修改代码。\n\n## 验证\n已运行测试。\n\n## 遗留问题\n无。\n\n## 下游说明\n可继续验收。",
          },
          toolResult: {
            success: true,
          },
          continuationResult: {
            success: true,
          },
          continuationSummary: "执行完成",
        })),
      },
    } as any;

    await executor.executeToolCall(
      conversation,
      {
        name: "finishPhase",
        arguments: {
          summary: "修复已完成",
          result:
            "## 交付物\n已修改代码。\n\n## 验证\n已运行测试。\n\n## 遗留问题\n无。\n\n## 下游说明\n可继续验收。",
        },
        toolCallId: "call-sub-1",
      },
      "tool",
    );

    expect(addMessage).toHaveBeenCalledTimes(2);
    expect(String(addMessage.mock.calls[0]?.[0]?.content)).toContain(
      '"kind":"assistant_tool_call"',
    );
    expect(String(addMessage.mock.calls[0]?.[0]?.content)).toContain('"toolName":"finishPhase"');
    expect(String(addMessage.mock.calls[0]?.[0]?.content)).toContain('"summary":"修复已完成"');
    expect(String(addMessage.mock.calls[1]?.[0]?.content)).toContain('"kind":"tool_result"');
    expect(String(addMessage.mock.calls[1]?.[0]?.content)).toContain('"summary":"执行完成"');
  });

  it("writes a checkpoint message when a tool returns checkpoint payload", async () => {
    const executor = new ToolExecutor();
    const addMessage = mock();
    const addWebsocketMessage = mock();
    const conversation = {
      id: "task-main-checkpoint",
      type: "main",
      parentId: undefined,
      isAborted: false,
      status: "tool_executing",
      memory: {
        addMessage,
        context: {},
        addWebsocketMessage,
        messages: [],
      },
      workflowAgentRole: "controller",
      toolService: {
        executeToolCall: mock(async () => ({
          message: "阶段 requirements 已完成，已进入 discovery",
          params: {
            summary: "需求已拆解完成",
            result: "需求文档已完成，下一步进入 discovery。",
          },
          toolResult: "需求文档已完成，下一步进入 discovery。",
          continuationResult: "需求已拆解完成",
          continuationSummary: "【当前阶段 discovery】",
          checkpointResult: {
            kind: "phase_complete",
            summary: "需求已拆解完成",
            result: "需求文档已完成，下一步进入 discovery。",
            completedPhase: "requirements",
            currentPhase: "discovery",
            agentRole: "controller",
          },
        })),
      },
    } as any;

    await executor.executeToolCall(
      conversation,
      {
        name: "finishPhase",
        arguments: {
          summary: "需求已拆解完成",
          result: "需求文档已完成，下一步进入 discovery。",
        },
        toolCallId: "call-checkpoint-1",
      },
      "tool",
    );

    expect(addMessage).toHaveBeenCalledTimes(3);
    expect(addMessage.mock.calls[2]?.[0]).toMatchObject({
      role: "user",
      type: "checkpoint",
      partial: false,
    });
    expect(String(addMessage.mock.calls[2]?.[0]?.content)).toContain("[Checkpoint]");
    expect(String(addMessage.mock.calls[2]?.[0]?.content)).toContain("已完成阶段：requirements");
    expect(String(addMessage.mock.calls[2]?.[0]?.content)).toContain("当前阶段：discovery");
  });

  it("still emits a final tool result when the abort signal flips after the tool returns", async () => {
    const executor = new ToolExecutor();
    const addMessage = mock();
    const addWebsocketMessage = mock();
    const controller = new AbortController();
    const conversation = {
      id: "task-tool-aborted-after-return",
      type: "main",
      parentId: undefined,
      isAborted: false,
      status: "tool_executing",
      workflowAgentRole: "controller",
      memory: {
        addMessage,
        context: {},
        addWebsocketMessage,
      },
      toolService: {
        executeToolCall: mock(async () => {
          controller.abort();
          return {
            message: "命令执行完成",
            params: { command: "npm test" },
            toolResult: {
              success: true,
              output: "ok",
              exitCode: 0,
              message: "命令执行完成",
            },
            continuationResult: {
              success: true,
              output: "ok",
              exitCode: 0,
              message: "命令已执行（退出码: 0）",
            },
            continuationSummary: "命令已执行（退出码: 0）",
          };
        }),
      },
    } as any;

    const broadcast = broadcaster.broadcast as ReturnType<typeof mock>;
    broadcast.mockClear();

    await executor.executeToolCall(
      conversation,
      {
        name: "bash",
        arguments: { command: "npm test" },
        toolCallId: "call-after-abort",
      },
      "tool",
      controller.signal,
    );

    expect(broadcast).toHaveBeenCalledTimes(2);
    const finalPayload = broadcast.mock.calls[1]?.[1];
    expect(finalPayload?.data?.partial).toBe(false);
    const parsed = JSON.parse(String(finalPayload?.data?.message));
    expect(parsed.result).toEqual({
      success: true,
      output: "ok",
      exitCode: 0,
      message: "命令执行完成",
    });
    expect(addMessage).toHaveBeenCalledTimes(2);
  });
});

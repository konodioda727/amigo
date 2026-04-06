import { describe, expect, it } from "bun:test";
import { ToolService } from "../index";

describe("ToolService", () => {
  it("passes through tool-level error while preserving toolResult", async () => {
    const toolService = new ToolService([], [
      {
        name: "customIdleTool",
        description: "test tool",
        completionBehavior: "idle",
        params: [],
        invoke: async () => ({
          message: "布局校验失败",
          error: "缺少这些模块: footer",
          toolResult: {
            success: false,
            validationErrors: ["缺少这些模块: footer"],
            message: "布局校验失败",
          },
        }),
      },
    ] as any);

    const result = await toolService.executeToolCall({
      toolName: "customIdleTool",
      params: {},
      context: {
        taskId: "task-1",
        parentId: undefined,
        signal: undefined,
        postMessage: undefined,
        getToolByName: () => undefined,
      },
    });

    expect(result.error).toBe("缺少这些模块: footer");
    expect(result.message).toBe("布局校验失败");
    expect(result.toolResult).toEqual({
      success: false,
      validationErrors: ["缺少这些模块: footer"],
      message: "布局校验失败",
    });
  });

  it("preserves continuation summary and result from ToolInvokeResult", async () => {
    const toolService = new ToolService([], [
      {
        name: "customContinuationTool",
        description: "test tool",
        params: [],
        invoke: async () => ({
          transport: {
            message: "完整前端消息",
            result: {
              success: true,
              content: "full transport payload",
            },
          },
          continuation: {
            summary: "精简摘要",
            result: {
              success: true,
              contentPreview: "continuation payload",
            },
          },
        }),
      },
    ] as any);

    const result = await toolService.executeToolCall({
      toolName: "customContinuationTool",
      params: {},
      context: {
        taskId: "task-2",
        parentId: undefined,
        signal: undefined,
        postMessage: undefined,
        getToolByName: () => undefined,
      },
    });

    expect(result.message).toBe("完整前端消息");
    expect(result.toolResult).toEqual({
      success: true,
      content: "full transport payload",
    });
    expect(result.continuationSummary).toBe("精简摘要");
    expect(result.continuationResult).toEqual({
      success: true,
      contentPreview: "continuation payload",
    });
  });

  it("preserves continuation fields from legacy tool return shape", async () => {
    const toolService = new ToolService([], [
      {
        name: "legacyContinuationTool",
        description: "test tool",
        params: [],
        invoke: async () => ({
          message: "legacy message",
          toolResult: {
            success: true,
            content: "legacy payload",
          },
          continuationSummary: "【已阅读 foo.md】",
          continuationResult: {
            success: true,
            contentPreview: "legacy continuation payload",
          },
        }),
      },
    ] as any);

    const result = await toolService.executeToolCall({
      toolName: "legacyContinuationTool",
      params: {},
      context: {
        taskId: "task-3",
        parentId: undefined,
        signal: undefined,
        postMessage: undefined,
        getToolByName: () => undefined,
      },
    });

    expect(result.message).toBe("legacy message");
    expect(result.toolResult).toEqual({
      success: true,
      content: "legacy payload",
    });
    expect(result.continuationSummary).toBe("【已阅读 foo.md】");
    expect(result.continuationResult).toEqual({
      success: true,
      contentPreview: "legacy continuation payload",
    });
  });
});

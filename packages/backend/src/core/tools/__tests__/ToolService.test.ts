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
});

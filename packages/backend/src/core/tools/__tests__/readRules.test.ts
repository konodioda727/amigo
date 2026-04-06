import { describe, expect, it } from "bun:test";
import { ToolService } from "../index";
import { createReadRulesTool } from "../readRules";

const provider = {
  getSystemPromptAppendix: () => undefined,
  getPromptReferences: () => [],
  getRule: async (id: string) => {
    if (id === "coding") {
      return {
        id,
        title: "Coding Mode",
        whenToRead: "Read when changing code",
        scopes: ["main", "sub"] as ("main" | "sub")[],
        content: "Investigate first.\nThen edit.\nThen verify.",
      };
    }
    return null;
  },
};

describe("readRules", () => {
  it("exposes ids as an array of strings in tool definitions", () => {
    const readRules = createReadRulesTool(provider);
    const toolService = new ToolService([readRules], []);
    const definition = toolService.getToolDefinitions().find((tool) => tool.name === "readRules");

    expect(definition).toBeDefined();
    expect(definition?.parameters).toEqual({
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: {
            type: "string",
            description: "单个规则 ID，例如 coding",
          },
          description: "要读取的规则 ID 列表",
        },
      },
      required: ["ids"],
    });
  });

  it("reads rule documents by id and preserves continuation summaries", async () => {
    const readRules = createReadRulesTool(provider);
    const result = await readRules.invoke({
      params: { ids: ["coding"] },
      context: {
        taskId: "task-1",
        getSandbox: async () => undefined,
        getToolByName: () => undefined,
      },
    });

    expect(result.transport.result.success).toBe(true);
    expect(result.transport.result.documents).toEqual([
      {
        success: true,
        id: "coding",
        title: "Coding Mode",
        whenToRead: "Read when changing code",
        content: "Investigate first.\nThen edit.\nThen verify.",
        message: "成功读取规则 coding",
      },
    ]);
    expect(result.continuation.summary).toBe("【已阅读规则 coding】");
  });

  it("returns mixed success when some rule ids are missing", async () => {
    const readRules = createReadRulesTool(provider);
    const result = await readRules.invoke({
      params: { ids: ["coding", "product"] },
      context: {
        taskId: "task-2",
        getSandbox: async () => undefined,
        getToolByName: () => undefined,
      },
    });

    expect(result.transport.result.success).toBe(false);
    expect(result.transport.result.message).toBe("读取完成：成功 1 条，失败 1 条");
    expect(result.transport.result.documents[1]).toEqual({
      success: false,
      id: "product",
      content: "",
      message: "未找到规则: product",
    });
  });
});

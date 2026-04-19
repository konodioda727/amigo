import { describe, expect, it } from "bun:test";
import type { ToolInterface } from "@amigo-llm/types";
import { ToolService } from "../ToolService";

const readFileTool = {
  name: "readFile",
  description: "read files",
  params: [{ name: "filePaths", optional: false, description: "files" }],
  invoke: async () => ({ message: "", toolResult: {} as any }),
} satisfies ToolInterface<"readFile">;

describe("ToolService", () => {
  it("keeps regular tool parameter definitions unchanged across workflow scopes", () => {
    const service = new ToolService([readFileTool], []);

    const workerDefinition = service.getToolDefinitions({
      currentPhase: "execution",
      agentRole: "execution_worker",
    })[0];
    const controllerDefinition = service.getToolDefinitions({
      currentPhase: "design",
      agentRole: "controller",
    })[0];

    expect(workerDefinition?.name).toBe("readFile");
    expect(controllerDefinition?.parameters.properties).toHaveProperty("filePaths");
  });

  it("returns generic workflow guidance when a tool is blocked", async () => {
    const taskListTool = {
      name: "taskList",
      description: "task list",
      params: [{ name: "action", optional: true, description: "action" }],
      invoke: async () => ({ message: "", toolResult: {} as any }),
    } satisfies ToolInterface<"taskList">;
    const service = new ToolService([taskListTool], []);

    const result = await service.executeToolCall({
      toolName: "taskList",
      params: { action: "execute" },
      context: {
        taskId: "task-1",
        currentPhase: "design",
        agentRole: "controller",
        getSandbox: async () => ({}),
        getToolByName: () => undefined,
      },
    });

    expect(result.error).toContain("工具 'taskList' 在当前 workflow 阶段/角色不可用");
    expect(result.error).toContain("currentPhase=design, agentRole=controller");
    expect(result.error).toContain("请先完成当前阶段要求的工作");
    expect(result.error).toContain("调用 finishPhase");
    expect(result.error).toContain("进入 execution 后再继续");
  });

  it("can emit compact tool definitions without extra guidance text", () => {
    const compactTool = {
      name: "askFollowupQuestion",
      description: "ask a followup",
      whenToUse: "only when blocked by a user-owned fact",
      params: [{ name: "question", optional: false, description: "question text" }],
      invoke: async () => ({ message: "", toolResult: {} as any }),
    } satisfies ToolInterface<"askFollowupQuestion">;
    const service = new ToolService([compactTool], []);

    const definition = service.getToolDefinitions(undefined, {
      includeWhenToUse: false,
      includeParameterDescriptions: false,
    })[0];

    expect(definition?.description).toBe("ask a followup");
    expect(definition?.parameters).toEqual({
      type: "object",
      properties: {
        question: {
          type: "string",
        },
      },
      required: ["question"],
    });
  });
});

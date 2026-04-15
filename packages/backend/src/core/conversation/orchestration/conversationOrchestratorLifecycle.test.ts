import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AmigoLlm } from "@/core/model";
import { ToolService } from "@/core/tools";
import { setGlobalState } from "@/globalState";
import { Conversation } from "../Conversation";
import { conversationRepository } from "../ConversationRepository";
import { setConversationUserInput } from "./conversationOrchestratorLifecycle";

mock.module("@/utils/logger", () => ({
  logger: {
    debug: mock(),
    info: mock(),
    warn: mock(),
    error: mock(),
  },
}));

describe("setConversationUserInput workflow restart", () => {
  let tempStorageRoot = "";

  beforeEach(() => {
    tempStorageRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-workflow-restart-"));
    setGlobalState("globalStoragePath", tempStorageRoot);
    setGlobalState("conversationPersistenceProvider", {
      exists: () => false,
      load: () => null,
      save: () => true,
      delete: () => true,
      listConversationRelations: () => [],
      listSessionHistories: () => [],
    });
    setGlobalState("memoryRuntime", undefined);
  });

  afterEach(() => {
    conversationRepository.remove("task-restart-workflow");
    rmSync(tempStorageRoot, { recursive: true, force: true });
    setGlobalState("conversationPersistenceProvider", undefined);
    setGlobalState("memoryRuntime", undefined);
  });

  it("restarts the default main-task workflow cycle after a completed conversation receives a new user message", async () => {
    const conversation = Conversation.create({
      id: "task-restart-workflow",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
      workflowState: {
        currentPhase: "complete",
        agentRole: "controller",
        visitedPhases: [
          "requirements",
          "discovery",
          "design",
          "execution",
          "verification",
          "complete",
        ],
        skippedPhases: [],
        phaseStates: {
          requirements: { status: "completed" },
          discovery: { status: "completed" },
          design: { status: "completed" },
          execution: { status: "completed" },
          verification: { status: "completed" },
          complete: { status: "in_progress" },
        },
      },
    });
    conversation.status = "completed";
    conversation.memory.updateExecutionTask("Task 1", {
      executionTaskId: "exec-1",
      status: "completed",
    } as any);

    mkdirSync(path.join(tempStorageRoot, conversation.id), { recursive: true });
    const taskListPath = path.join(tempStorageRoot, conversation.id, "taskList.md");
    writeFileSync(taskListPath, "- [ ] Task 1.1: old work [deps: none]", "utf-8");

    conversationRepository.save(conversation);

    await setConversationUserInput(conversation, "new task");

    expect(conversation.currentWorkflowPhase).toBe("requirements");
    expect(conversation.workflowAgentRole).toBe("controller");
    expect(conversation.workflowState.phaseSequence).toEqual([
      "requirements",
      "design",
      "execution",
      "verification",
      "complete",
    ]);
    expect(conversation.memory.executionTasks).toEqual({});
    expect(existsSync(taskListPath)).toBe(false);
    expect(conversation.userInput).toBe("new task");
    expect(conversation.memory.lastMessage?.content).toBe("new task");
    expect(
      conversation.memory.messages.some(
        (message) =>
          message.role === "user" &&
          message.type === "system" &&
          message.content.includes("[WorkflowState]") &&
          message.content.includes("当前阶段：requirements"),
      ),
    ).toBe(true);
  });

  it("keeps an in-progress workflow unchanged when receiving additional user input", async () => {
    const conversation = Conversation.create({
      id: "task-restart-workflow",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
      workflowState: {
        currentPhase: "design",
        agentRole: "controller",
        phaseSequence: ["requirements", "design", "execution", "verification", "complete"],
        visitedPhases: ["requirements", "design"],
        skippedPhases: [],
        phaseStates: {
          requirements: { status: "completed" },
          design: { status: "in_progress" },
          execution: { status: "pending" },
          verification: { status: "pending" },
          complete: { status: "pending" },
        },
      },
    });
    conversation.status = "idle";
    conversation.memory.addMessage({
      role: "user",
      content: "先帮我看看登录接口为什么 500",
      type: "userSendMessage",
      partial: false,
    });
    conversation.memory.addMessage({
      role: "assistant",
      content: "我先排查一下。",
      type: "assistantResponse",
      partial: false,
    });
    conversation.memory.addMessage({
      role: "user",
      content: "定位完后把它修掉，再补跑回归验证",
      type: "userSendMessage",
      partial: false,
    });

    conversationRepository.save(conversation);

    await setConversationUserInput(conversation, "继续");

    expect(conversation.currentWorkflowPhase).toBe("design");
    expect(conversation.workflowState.phaseSequence).toEqual([
      "requirements",
      "design",
      "execution",
      "verification",
      "complete",
    ]);
    expect(conversation.userInput).toBe("继续");
  });

  it("does not reroute an in-progress workflow when the latest user message looks like a new ask", async () => {
    const conversation = Conversation.create({
      id: "task-restart-workflow",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
      workflowState: {
        currentPhase: "design",
        agentRole: "controller",
        phaseSequence: ["requirements", "design", "execution", "verification", "complete"],
        visitedPhases: ["requirements", "design"],
        skippedPhases: [],
        phaseStates: {
          requirements: { status: "completed" },
          design: { status: "in_progress" },
          execution: { status: "pending" },
          verification: { status: "pending" },
          complete: { status: "pending" },
        },
      },
    });
    conversation.status = "idle";
    conversation.memory.addMessage({
      role: "user",
      content: "先帮我看看登录接口为什么 500",
      type: "userSendMessage",
      partial: false,
    });

    conversationRepository.save(conversation);

    await setConversationUserInput(conversation, "顺手把前端那个样式也一起修掉并回归验证");

    expect(conversation.currentWorkflowPhase).toBe("design");
    expect(conversation.workflowState.phaseSequence).toEqual([
      "requirements",
      "design",
      "execution",
      "verification",
      "complete",
    ]);
    expect(conversation.userInput).toBe("顺手把前端那个样式也一起修掉并回归验证");
  });

  it("does not reset an in-progress phased workflow when the frontend resends the same workflowMode", async () => {
    const conversation = Conversation.create({
      id: "task-restart-workflow",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
      workflowState: {
        currentPhase: "execution",
        agentRole: "controller",
        mode: "phased",
        phaseSequence: ["requirements", "design", "execution", "verification", "complete"],
        visitedPhases: ["requirements", "design", "execution"],
        skippedPhases: [],
        phaseStates: {
          requirements: { status: "completed" },
          design: { status: "completed" },
          execution: { status: "in_progress" },
          verification: { status: "pending" },
          complete: { status: "pending" },
        },
      },
    });
    conversation.status = "idle";
    conversationRepository.save(conversation);

    await setConversationUserInput(conversation, "继续把剩下的问题修完", undefined, "phased");

    expect(conversation.currentWorkflowPhase).toBe("execution");
    expect(conversation.workflowState.mode).toBe("phased");
    expect(conversation.workflowState.phaseSequence).toEqual([
      "requirements",
      "design",
      "execution",
      "verification",
      "complete",
    ]);
    expect(conversation.userInput).toBe("继续把剩下的问题修完");
  });

  it("preserves raw history but stores projected completion seed history for the next turn", async () => {
    const conversation = Conversation.create({
      id: "task-restart-workflow",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
      workflowState: {
        currentPhase: "complete",
        agentRole: "controller",
        mode: "phased",
        phaseSequence: ["requirements", "design", "execution", "verification", "complete"],
        visitedPhases: ["requirements", "design", "execution", "verification", "complete"],
        skippedPhases: [],
        phaseStates: {
          requirements: { status: "completed" },
          design: { status: "completed" },
          execution: { status: "completed" },
          verification: { status: "completed" },
          complete: { status: "in_progress" },
        },
      },
    });
    conversation.status = "completed";
    conversation.memory.addMessage({
      role: "user",
      content: "旧任务描述",
      type: "userSendMessage",
      partial: false,
    });
    conversation.memory.addMessage({
      role: "assistant",
      content: "旧任务中间回复",
      type: "assistantResponse",
      partial: false,
    });
    conversation.memory.addMessage({
      role: "assistant",
      content: JSON.stringify({
        kind: "assistant_tool_call",
        toolName: "completeTask",
        arguments: {
          summary: "旧任务已完成",
          result: "交付结果",
        },
      }),
      type: "tool",
      partial: false,
    });
    conversation.memory.addMessage({
      role: "user",
      content: JSON.stringify({
        kind: "tool_result",
        toolName: "completeTask",
        result: "交付结果",
        summary: "旧任务已完成",
      }),
      type: "tool",
      partial: false,
    });
    conversation.memory.addMessage({
      role: "user",
      content: "[Checkpoint]\n类型：task_complete\n摘要：旧任务已完成\n结果：\n交付结果",
      type: "checkpoint",
      partial: false,
    });
    conversation.memory.addWebsocketMessage({
      type: "tool",
      data: {
        message: JSON.stringify({
          toolName: "completeTask",
          params: {
            summary: "旧任务已完成",
            result: "交付结果",
          },
          result: "交付结果",
        }),
      },
    } as any);

    await setConversationUserInput(conversation, "开始新任务");

    expect(
      conversation.memory.messages.some((message) => message.content === "旧任务中间回复"),
    ).toBe(true);
    expect(conversation.memory.messages.filter((message) => message.type === "tool").length).toBe(
      2,
    );
    expect(conversation.memory.lastMessage?.content).toBe("开始新任务");
    expect(
      conversation.workflowState.completionSeedState?.messages.map((message) => ({
        role: message.role,
        type: message.type,
        content: message.content,
      })),
    ).toEqual([
      {
        role: "user",
        type: "userSendMessage",
        content: "旧任务描述",
      },
      {
        role: "user",
        type: "checkpoint",
        content: "[Checkpoint]\n类型：task_complete\n摘要：旧任务已完成\n结果：\n交付结果",
      },
    ]);
    expect(conversation.workflowState.completionSeedState?.sourceMessageCount).toBe(6);
  });

  it("switches a new turn into fast mode when the user asks for it", async () => {
    const conversation = Conversation.create({
      id: "task-restart-workflow",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
    });

    await setConversationUserInput(conversation, "用快速模式直接处理这个问题");

    expect(conversation.workflowState.mode).toBe("fast");
    expect(conversation.currentWorkflowPhase).toBe("complete");
    expect(conversation.workflowState.phaseSequence).toEqual(["complete"]);
  });

  it("switches workflow mode from explicit message metadata", async () => {
    const conversation = Conversation.create({
      id: "task-explicit-workflow-mode",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
    });

    await setConversationUserInput(conversation, "继续处理", undefined, "fast");

    expect(conversation.workflowState.mode).toBe("fast");
    expect(conversation.currentWorkflowPhase).toBe("complete");
    expect(conversation.workflowState.phaseSequence).toEqual(["complete"]);
  });
});

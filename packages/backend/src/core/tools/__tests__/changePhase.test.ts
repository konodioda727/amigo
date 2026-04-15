import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Conversation } from "@/core/conversation/Conversation";
import { conversationRepository } from "@/core/conversation/ConversationRepository";
import type { AmigoLlm } from "@/core/model";
import { setGlobalState } from "@/globalState";
import { OverridePhase } from "../changePhase";
import { ToolService } from "../ToolService";

describe("overridePhase", () => {
  let tempStorageRoot = "";

  beforeEach(() => {
    tempStorageRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-change-phase-"));
    setGlobalState("globalStoragePath", tempStorageRoot);
    setGlobalState("conversationPersistenceProvider", {
      exists: () => false,
      load: () => null,
      save: () => true,
      delete: () => true,
      listConversationRelations: () => [],
      listSessionHistories: () => [],
    });
  });

  afterEach(() => {
    conversationRepository.remove("task-change-phase");
    rmSync(tempStorageRoot, { recursive: true, force: true });
    setGlobalState("conversationPersistenceProvider", undefined);
  });

  it("can move an in-progress task back to an earlier phase", async () => {
    const conversation = Conversation.create({
      id: "task-change-phase",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
      workflowState: {
        currentPhase: "execution",
        agentRole: "controller",
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
    conversationRepository.save(conversation);

    const result = await OverridePhase.invoke({
      params: {
        targetPhase: "design",
        reason: "用户指出前面的判断错了，需要回到设计阶段重做",
      },
      context: {
        taskId: conversation.id,
        parentId: undefined,
        getSandbox: async () => ({}) as never,
        getToolByName: () => undefined,
        signal: undefined,
        agentRole: "controller",
        currentPhase: "execution",
      },
    });

    expect(result.error).toBeUndefined();
    expect(conversation.currentWorkflowPhase).toBe("design");
    expect(conversation.workflowState.phaseStates.design.status).toBe("in_progress");
    expect(conversation.workflowState.phaseStates.execution.status).toBe("pending");
    expect(conversation.workflowState.phaseStates.verification.status).toBe("pending");
    expect(conversation.workflowState.phaseStates.complete.status).toBe("pending");
  });

  it("keeps the full controller sequence when moving to an earlier phase", async () => {
    const conversation = Conversation.create({
      id: "task-change-phase",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
      workflowState: {
        currentPhase: "verification",
        agentRole: "controller",
        phaseSequence: ["requirements", "design", "execution", "verification", "complete"],
        visitedPhases: ["requirements", "design", "execution", "verification"],
        skippedPhases: [],
        phaseStates: {
          requirements: { status: "completed" },
          design: { status: "completed" },
          execution: { status: "completed" },
          verification: { status: "in_progress" },
          complete: { status: "pending" },
        },
      },
    });
    conversationRepository.save(conversation);

    const result = await OverridePhase.invoke({
      params: {
        targetPhase: "requirements",
        reason: "用户又换了一个问题，需要重新整理需求",
      },
      context: {
        taskId: conversation.id,
        parentId: undefined,
        getSandbox: async () => ({}) as never,
        getToolByName: () => undefined,
        signal: undefined,
        agentRole: "controller",
        currentPhase: "design",
      },
    });

    expect(result.error).toBeUndefined();
    expect(conversation.currentWorkflowPhase).toBe("requirements");
    expect(conversation.workflowState.phaseSequence).toEqual([
      "requirements",
      "design",
      "execution",
      "verification",
      "complete",
    ]);
  });

  it("can jump forward across intermediate phases", async () => {
    const conversation = Conversation.create({
      id: "task-change-phase",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
      workflowState: {
        currentPhase: "requirements",
        agentRole: "controller",
        phaseSequence: ["requirements", "design", "execution", "verification", "complete"],
        visitedPhases: ["requirements"],
        skippedPhases: [],
        phaseStates: {
          requirements: { status: "in_progress" },
          design: { status: "pending" },
          execution: { status: "pending" },
          verification: { status: "pending" },
          complete: { status: "pending" },
        },
      },
    });
    conversationRepository.save(conversation);

    const result = await OverridePhase.invoke({
      params: {
        targetPhase: "execution",
        reason: "用户已经明确接受现成方案，不需要单独停留在 design",
      },
      context: {
        taskId: conversation.id,
        parentId: undefined,
        getSandbox: async () => ({}) as never,
        getToolByName: () => undefined,
        signal: undefined,
        agentRole: "controller",
        currentPhase: "requirements",
      },
    });

    expect(result.error).toBeUndefined();
    expect(conversation.currentWorkflowPhase).toBe("execution");
    expect(conversation.workflowState.phaseStates.requirements.status).toBe("completed");
    expect(conversation.workflowState.phaseStates.design.status).toBe("skipped");
    expect(conversation.workflowState.phaseStates.execution.status).toBe("in_progress");
  });

  it("blocks using overridePhase for the normal next phase", async () => {
    const conversation = Conversation.create({
      id: "task-change-phase",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
      workflowState: {
        currentPhase: "requirements",
        agentRole: "controller",
        phaseSequence: ["requirements", "design", "execution", "verification", "complete"],
        visitedPhases: ["requirements"],
        skippedPhases: [],
        phaseStates: {
          requirements: { status: "in_progress" },
          design: { status: "pending" },
          execution: { status: "pending" },
          verification: { status: "pending" },
          complete: { status: "pending" },
        },
      },
    });
    conversationRepository.save(conversation);

    const result = await OverridePhase.invoke({
      params: {
        targetPhase: "design",
        reason: "已经做完需求整理，想进入下一阶段",
      },
      context: {
        taskId: conversation.id,
        parentId: undefined,
        getSandbox: async () => ({}) as never,
        getToolByName: () => undefined,
        signal: undefined,
        agentRole: "controller",
        currentPhase: "requirements",
      },
    });

    expect(result.error).toContain("请调用 completeTask");
    expect(conversation.currentWorkflowPhase).toBe("requirements");
  });

  it("lets fast mode fall back into design when the task turns complex", async () => {
    const conversation = Conversation.create({
      id: "task-change-phase",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
      workflowState: {
        currentPhase: "complete",
        agentRole: "controller",
        mode: "fast",
        phaseSequence: ["complete"],
        visitedPhases: ["complete"],
        skippedPhases: [],
        phaseStates: {
          requirements: { status: "pending" },
          design: { status: "pending" },
          execution: { status: "pending" },
          verification: { status: "pending" },
          complete: { status: "in_progress" },
        },
      },
    });
    conversationRepository.save(conversation);

    const result = await OverridePhase.invoke({
      params: {
        targetPhase: "design",
        reason: "执行途中发现问题类型变了，需要重新做设计收敛",
      },
      context: {
        taskId: conversation.id,
        parentId: undefined,
        getSandbox: async () => ({}) as never,
        getToolByName: () => undefined,
        signal: undefined,
        agentRole: "controller",
        currentPhase: "complete",
      },
    });

    expect(result.error).toBeUndefined();
    expect(conversation.workflowState.mode).toBe("phased");
    expect(conversation.currentWorkflowPhase).toBe("design");
    expect(conversation.workflowState.phaseSequence).toEqual([
      "requirements",
      "design",
      "execution",
      "verification",
      "complete",
    ]);
    expect(result.transport.message).toContain("已切回 phased workflow");
    expect(conversation.workflowState.phaseStates.design.status).toBe("in_progress");
    expect(conversation.workflowState.phaseStates.execution.status).toBe("pending");
  });
});

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Conversation } from "@/core/conversation/Conversation";
import { conversationRepository } from "@/core/conversation/ConversationRepository";
import type { AmigoLlm } from "@/core/model";
import { setGlobalState } from "@/globalState";
import { FinishPhase } from "../finishPhase";
import { ToolService } from "../ToolService";

describe("finishPhase phase transitions", () => {
  let tempStorageRoot = "";

  beforeEach(() => {
    tempStorageRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-complete-task-"));
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
    conversationRepository.remove("task-complete-missing-doc");
    conversationRepository.remove("task-complete-with-doc");
    conversationRepository.remove("task-complete-verification-doc");
    conversationRepository.remove("task-complete-verification-blocked");
    conversationRepository.remove("task-complete-requirements-no-doc");
    conversationRepository.remove("task-complete-design-direct-to-complete");
    conversationRepository.remove("task-complete-design-handoff-required");
    conversationRepository.remove("task-complete-design-handoff-success");
    rmSync(tempStorageRoot, { recursive: true, force: true });
    setGlobalState("conversationPersistenceProvider", undefined);
  });

  it("documents execution-worker verification evidence requirements in the result param", () => {
    const resultParam = FinishPhase.params.find((param) => param.name === "result");

    expect(resultParam?.description).toContain("## 交付物");
    expect(resultParam?.description).toContain("LSP/diagnostics");
    expect(resultParam?.description).toContain("build/lint/工程级检查");
    expect(resultParam?.description).toContain("真实链路集成测试");
    expect(resultParam?.description).toContain("不能只写局部测试或口头判断");
  });

  it("allows requirements phase completion without a requirements doc", async () => {
    const conversation = Conversation.create({
      id: "task-complete-requirements-no-doc",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
      workflowState: {
        currentPhase: "requirements",
        agentRole: "controller",
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

    const result = await FinishPhase.invoke({
      params: {
        summary: "用户要修复 Android 构建问题，并优先保证稳定性",
        result:
          "1. 修复 Android 构建问题。\n2. 优先保证稳定性，不追求大改。\n3. 若需取舍，先保证现有功能不回退。",
        nextPhase: "design",
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
    expect(conversation.currentWorkflowPhase).toBe("design");
    expect(result.continuation.summary).toBe("【当前阶段 design】");
    expect((result.transport as { websocketData?: unknown }).websocketData).toEqual({
      kind: "phase_complete",
      completedPhase: "requirements",
      currentPhase: "design",
      agentRole: "controller",
    });
    expect((result as { checkpoint?: { result?: unknown } }).checkpoint?.result).toEqual({
      kind: "phase_complete",
      summary: "用户要修复 Android 构建问题，并优先保证稳定性",
      result:
        "1. 修复 Android 构建问题。\n2. 优先保证稳定性，不追求大改。\n3. 若需取舍，先保证现有功能不回退。",
      completedPhase: "requirements",
      currentPhase: "design",
      agentRole: "controller",
    });
  });

  it("allows controller phase completion without requiring a phase doc", async () => {
    const conversation = Conversation.create({
      id: "task-complete-missing-doc",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
      workflowState: {
        currentPhase: "design",
        agentRole: "controller",
        visitedPhases: ["design"],
        skippedPhases: [],
        phaseStates: {
          requirements: { status: "pending" },
          design: { status: "in_progress" },
          execution: { status: "pending" },
          verification: { status: "pending" },
          complete: { status: "pending" },
        },
      },
    });
    conversationRepository.save(conversation);

    const result = await FinishPhase.invoke({
      params: {
        summary: "设计已收敛",
        result: [
          "## 已确认事实",
          "- 目标文件已定位。",
          "## 关键约束",
          "- 维持最小改动面。",
          "## 实施计划",
          "- 进入 execution 后直接修改目标文件。",
        ].join("\n"),
        nextPhase: "execution",
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
    expect(conversation.currentWorkflowPhase).toBe("execution");
    expect((result.transport as { websocketData?: unknown }).websocketData).toEqual({
      kind: "phase_complete",
      completedPhase: "design",
      currentPhase: "execution",
      agentRole: "controller",
    });
    expect((result as { checkpoint?: { result?: unknown } }).checkpoint?.result).toEqual({
      kind: "phase_complete",
      summary: "设计已收敛",
      result: [
        "## 已确认事实",
        "- 目标文件已定位。",
        "## 关键约束",
        "- 维持最小改动面。",
        "## 实施计划",
        "- 进入 execution 后直接修改目标文件。",
      ].join("\n"),
      completedPhase: "design",
      currentPhase: "execution",
      agentRole: "controller",
    });
  });

  it("allows controller phase completion without requiring persisted phase docs", async () => {
    const conversation = Conversation.create({
      id: "task-complete-with-doc",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
      workflowState: {
        currentPhase: "design",
        agentRole: "controller",
        visitedPhases: ["design"],
        skippedPhases: [],
        phaseStates: {
          requirements: { status: "pending" },
          design: { status: "in_progress" },
          execution: { status: "pending" },
          verification: { status: "pending" },
          complete: { status: "pending" },
        },
      },
    });
    conversationRepository.save(conversation);

    const result = await FinishPhase.invoke({
      params: {
        summary: "设计已收敛",
        result: [
          "## 已确认事实",
          "- 目标文件已定位。",
          "## 关键约束",
          "- 保持现有接口不变。",
          "## 实施计划",
          "- 进入 execution 后直接补齐缺失导入。",
        ].join("\n"),
        nextPhase: "execution",
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
    expect(conversation.currentWorkflowPhase).toBe("execution");
    expect(result.continuation.summary).toBe("【当前阶段 execution】");
    expect((result.transport as { websocketData?: unknown }).websocketData).toEqual({
      kind: "phase_complete",
      completedPhase: "design",
      currentPhase: "execution",
      agentRole: "controller",
    });
    expect((result as { checkpoint?: { result?: unknown } }).checkpoint?.result).toEqual({
      kind: "phase_complete",
      summary: "设计已收敛",
      result: [
        "## 已确认事实",
        "- 目标文件已定位。",
        "## 关键约束",
        "- 保持现有接口不变。",
        "## 实施计划",
        "- 进入 execution 后直接补齐缺失导入。",
      ].join("\n"),
      completedPhase: "design",
      currentPhase: "execution",
      agentRole: "controller",
    });
  });

  it("blocks design phase completion when the execution handoff is still unresolved", async () => {
    const conversation = Conversation.create({
      id: "task-complete-design-handoff-required",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
      workflowState: {
        currentPhase: "design",
        agentRole: "controller",
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
    conversationRepository.save(conversation);

    const result = await FinishPhase.invoke({
      params: {
        summary: "已经找到大方向，但还有关键点没确认",
        result: [
          "## 已确认事实",
          "- 目标文件已经定位。",
          "## 关键约束",
          "- 不能破坏现有 API。",
          "## 实施计划",
          "- 先补 import，再补验证。",
          "## 未决问题",
          "- `getDefaultConfigSnippet` 是否存在还需要确认。",
        ].join("\n"),
        nextPhase: "execution",
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

    expect(result.error).toContain("design 阶段尚未形成可直接执行的 handoff");
    expect(conversation.currentWorkflowPhase).toBe("design");
    expect(conversation.workflowState.designExecutionHandoff).toBeUndefined();
  });

  it("stores a structured design-to-execution handoff before entering execution", async () => {
    const conversation = Conversation.create({
      id: "task-complete-design-handoff-success",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
      workflowState: {
        currentPhase: "design",
        agentRole: "controller",
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
    conversationRepository.save(conversation);

    const result = await FinishPhase.invoke({
      params: {
        summary: "设计已收敛，可以直接开始落地",
        result: [
          "## 已确认事实",
          "- 需要修改 `plugin/src/android/appBuildGradle.ts`。",
          "- `sourceCode.ts` 已包含所需的块操作工具函数。",
          "## 关键约束",
          "- 只允许最小范围改动。",
          "## 实施计划",
          "- 直接补齐缺失 import。",
          "- 修改后运行构建检查。",
        ].join("\n"),
        nextPhase: "execution",
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
    expect(conversation.currentWorkflowPhase).toBe("execution");
    expect(conversation.workflowState.designExecutionHandoff).toEqual({
      summary: "设计已收敛，可以直接开始落地",
      confirmedFacts: [
        "需要修改 `plugin/src/android/appBuildGradle.ts`。",
        "`sourceCode.ts` 已包含所需的块操作工具函数。",
      ],
      constraints: ["只允许最小范围改动。"],
      implementationPlan: ["直接补齐缺失 import。", "修改后运行构建检查。"],
      unresolvedQuestions: [],
      sourceResult: [
        "## 已确认事实",
        "- 需要修改 `plugin/src/android/appBuildGradle.ts`。",
        "- `sourceCode.ts` 已包含所需的块操作工具函数。",
        "## 关键约束",
        "- 只允许最小范围改动。",
        "## 实施计划",
        "- 直接补齐缺失 import。",
        "- 修改后运行构建检查。",
      ].join("\n"),
    });
  });

  it("advances verification to complete when verification has actually passed", async () => {
    const conversation = Conversation.create({
      id: "task-complete-verification-doc",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
      workflowState: {
        currentPhase: "verification",
        agentRole: "controller",
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

    const result = await FinishPhase.invoke({
      params: {
        summary: "验证通过，可以进入最终交付",
        result: "LSP、工程级检查和真实链路验证都已通过，本轮可以放行。",
        nextPhase: "complete",
      },
      context: {
        taskId: conversation.id,
        parentId: undefined,
        getSandbox: async () => ({}) as never,
        getToolByName: () => undefined,
        signal: undefined,
        agentRole: "controller",
        currentPhase: "verification",
      },
    });

    expect(result.error).toBeUndefined();
    expect(conversation.currentWorkflowPhase).toBe("complete");
    expect(result.continuation.summary).toBe("【当前阶段 complete】");
    expect((result.transport as { websocketData?: unknown }).websocketData).toEqual({
      kind: "phase_complete",
      completedPhase: "verification",
      currentPhase: "complete",
      agentRole: "controller",
    });
    expect((result as { checkpoint?: { result?: unknown } }).checkpoint?.result).toEqual({
      kind: "phase_complete",
      summary: "验证通过，可以进入最终交付",
      result: "LSP、工程级检查和真实链路验证都已通过，本轮可以放行。",
      completedPhase: "verification",
      currentPhase: "complete",
      agentRole: "controller",
    });
  });

  it("blocks verification from entering complete when the verdict is not passed", async () => {
    const conversation = Conversation.create({
      id: "task-complete-verification-blocked",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
      workflowState: {
        currentPhase: "verification",
        agentRole: "controller",
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

    const result = await FinishPhase.invoke({
      params: {
        summary: "本轮验证结论：不通过",
        result: [
          "已确认事实",
          "工程级检查未跑通，当前仍阻塞。",
          "最终状态",
          "不能放行到 complete。",
        ].join("\n"),
        nextPhase: "complete",
      },
      context: {
        taskId: conversation.id,
        parentId: undefined,
        getSandbox: async () => ({}) as never,
        getToolByName: () => undefined,
        signal: undefined,
        agentRole: "controller",
        currentPhase: "verification",
      },
    });

    expect(result.error).toContain("暂时不能进入 complete");
    expect(result.error).toContain("请继续当前会话推进");
    expect(conversation.currentWorkflowPhase).toBe("verification");
  });
});

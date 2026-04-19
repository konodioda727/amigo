import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AmigoLlm } from "@/core/model";
import { ToolService } from "@/core/tools";
import { setGlobalState } from "@/globalState";
import { Conversation } from "../Conversation";
import { conversationRepository } from "../ConversationRepository";
import { runExecutionTaskWithOrchestrator } from "../orchestration/conversationOrchestratorExecution";

describe("runExecutionTaskWithOrchestrator", () => {
  let tempStorageRoot = "";

  beforeEach(() => {
    tempStorageRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-exec-history-"));
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
    rmSync(tempStorageRoot, { recursive: true, force: true });
    setGlobalState("conversationPersistenceProvider", undefined);
    setGlobalState("globalStoragePath", undefined);
  });

  it("inherits parent design-phase history into newly created execution workers", async () => {
    const parentConversation = Conversation.create({
      id: "parent-history-task",
      toolService: new ToolService([], []),
      llm: {} as unknown as AmigoLlm,
      workflowState: {
        currentPhase: "execution",
        agentRole: "controller",
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
    parentConversation.memory.addMessage({
      role: "user",
      type: "system",
      partial: false,
      content: "[WorkflowState]\n当前阶段：design\n当前角色：controller",
    });
    parentConversation.memory.addMessage({
      role: "user",
      type: "userSendMessage",
      partial: false,
      content: "请先设计任务拆解方案",
    });
    parentConversation.memory.addMessage({
      role: "assistant",
      type: "message",
      partial: false,
      content: "会先调查代码，再形成执行方案。",
    });
    parentConversation.memory.addMessage({
      role: "assistant",
      type: "tool",
      partial: false,
      content: JSON.stringify({
        toolName: "finishPhase",
        params: {
          summary: "设计阶段已完成。",
          result: "普通的阶段总结。",
        },
      }),
    });
    parentConversation.memory.addMessage({
      role: "user",
      type: "tool",
      partial: false,
      content: JSON.stringify({
        toolName: "finishPhase",
        result: { success: true },
      }),
    });
    parentConversation.memory.addMessage({
      role: "user",
      type: "checkpoint",
      partial: false,
      content: "[Checkpoint]\n类型：phase_complete\n已完成阶段：design",
    });
    parentConversation.memory.addMessage({
      role: "user",
      type: "system",
      partial: false,
      content: "[WorkflowState]\n当前阶段：execution\n当前角色：controller",
    });
    parentConversation.memory.addMessage({
      role: "assistant",
      type: "message",
      partial: false,
      content: "这段 execution/controller 历史不应该被子任务继承。",
    });
    parentConversation.memory.addMessage({
      role: "user",
      type: "ws:message",
      partial: false,
      content: '{"message":"这条 websocket 噪音也不该被继承"}',
    });
    conversationRepository.save(parentConversation);

    const result = await runExecutionTaskWithOrchestrator({
      params: {
        subPrompt: "子任务提示",
        target: "实现 Task 1.1",
        parentId: parentConversation.id,
        tools: [],
        taskDescription: "Task 1.1: 实现执行器",
      },
      getExecutor: () =>
        ({
          execute: (conversation: Conversation) => {
            conversation.status = "completed";
          },
        }) as never,
      removeExecutor: () => {},
      setUserInput: async (conversation, message) => {
        conversation.userInput = message;
        conversation.memory.addMessage({
          role: "user",
          type: "userSendMessage",
          partial: false,
          content: message,
        });
      },
      resumeConversation: () => {},
    });

    expect(result.status).toBe("completed");
    const executionConversation = conversationRepository.load(result.executionTaskId);
    expect(executionConversation).not.toBeNull();
    const inheritedContents =
      executionConversation?.memory.messages.map((message) => message.content) || [];
    expect(inheritedContents.some((content) => content.includes("[InheritedParentHistory]"))).toBe(
      true,
    );
    expect(inheritedContents).toContain("[WorkflowState]\n当前阶段：design\n当前角色：controller");
    expect(inheritedContents).toContain("请先设计任务拆解方案");
    expect(inheritedContents).toContain("会先调查代码，再形成执行方案。");
    expect(inheritedContents).toContain("[Checkpoint]\n类型：phase_complete\n已完成阶段：design");
    expect(
      inheritedContents.some((content) =>
        content.includes("这段 execution/controller 历史不应该被子任务继承。"),
      ),
    ).toBe(false);
    expect(inheritedContents.some((content) => content.includes("设计阶段已完成。"))).toBe(false);
    expect(inheritedContents.some((content) => content.includes("普通的阶段总结。"))).toBe(false);
    expect(inheritedContents.some((content) => content.includes("websocket 噪音"))).toBe(false);
  });
});

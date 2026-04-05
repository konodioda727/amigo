import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  conversationRepository,
  fileConversationPersistenceProvider,
  logger,
  setGlobalState,
  taskOrchestrator,
} from "@amigo-llm/backend";
import {
  AMIGO_SUBTASK_COMPLETION_PROMPT,
  evaluateAmigoSubTaskWaitReview,
  parseIndependentReviewerDecision,
} from "../codingSubTaskPolicy";

describe("codingSubTaskPolicy", () => {
  let tempStorageRoot = "";
  let originalGetExecutor: typeof taskOrchestrator.getExecutor;

  beforeEach(() => {
    tempStorageRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-coding-reviewer-"));
    (logger as { debug?: (...args: unknown[]) => void }).debug ??= () => {};
    setGlobalState("globalStoragePath", tempStorageRoot);
    setGlobalState("conversationPersistenceProvider", fileConversationPersistenceProvider);
    originalGetExecutor = taskOrchestrator.getExecutor.bind(taskOrchestrator);
  });

  afterEach(async () => {
    taskOrchestrator.getExecutor = originalGetExecutor;
    for (const conversation of conversationRepository.getAll()) {
      if (!conversation.parentId) {
        await conversationRepository.deleteWithChildren(conversation.id);
      } else {
        await conversationRepository.deleteWithChildren(conversation.id);
      }
    }
    rmSync(tempStorageRoot, { recursive: true, force: true });
    setGlobalState("conversationPersistenceProvider", undefined);
  });

  it("documents the subtask completion discipline", () => {
    expect(AMIGO_SUBTASK_COMPLETION_PROMPT).toContain("completeTask");
    expect(AMIGO_SUBTASK_COMPLETION_PROMPT).toContain("## 验证");
    expect(AMIGO_SUBTASK_COMPLETION_PROMPT).toContain("不要把“还在排查");
  });

  it("parses independent reviewer decisions from tagged output", () => {
    const parsed = parseIndependentReviewerDecision(
      [
        "<review_decision>request_changes</review_decision>",
        "<review_summary>验证覆盖不足</review_summary>",
        "<review_feedback>请补跑 runChecks 并核对 changedFiles 中的实现。</review_feedback>",
      ].join("\n"),
    );

    expect(parsed).toEqual({
      action: "request_changes",
      message: "验证覆盖不足",
      feedback: "请补跑 runChecks 并核对 changedFiles 中的实现。",
    });
  });

  it("spawns an independent reviewer for subtask wait_review tasks", async () => {
    const parent = conversationRepository.create({
      id: "parent-reviewer-main",
      type: "main",
      llm: {} as never,
    });

    taskOrchestrator.getExecutor = (() =>
      ({
        execute: async (
          conversation: Parameters<ReturnType<typeof taskOrchestrator.getExecutor>["execute"]>[0],
        ) => {
          conversation.memory.addMessage({
            role: "assistant",
            type: "message",
            partial: false,
            content: [
              "<review_decision>approve</review_decision>",
              "<review_summary>实现与验证一致，可批准。</review_summary>",
              "<review_feedback>无</review_feedback>",
            ].join("\n"),
          });
          conversation.status = "completed";
        },
      }) as unknown as ReturnType<
        typeof taskOrchestrator.getExecutor
      >) as typeof taskOrchestrator.getExecutor;

    const decision = await evaluateAmigoSubTaskWaitReview({
      subTaskId: "sub-reviewer-1",
      pendingPayload: {
        summary: "done",
        result:
          "## 交付物\n已更新实现。\n\n## 验证\nrunChecks: typecheck\n\n## 遗留问题\n无\n\n## 下游说明\n可继续联调。",
        changedFiles: ["packages/backend/src/foo.ts"],
        verification: [
          {
            label: "runChecks: typecheck",
            status: "passed",
            command: "bun run typecheck",
            evidence: "runChecks passed",
          },
        ],
        openRisks: [],
      },
      taskDescription: "Task 1.1: 修复 foo.ts",
      parentTaskId: parent.id,
      parentMessages: [],
      subTaskMessages: [],
      toolNames: ["completeTask", "runChecks"],
      context: undefined,
    });

    expect(decision).toEqual({
      action: "approve",
      message: "实现与验证一致，可批准。",
      feedback: undefined,
    });
    expect(conversationRepository.getAll()).toHaveLength(1);
  });

  it("uses the reviewer's latest assistant message as the decision source", async () => {
    const parent = conversationRepository.create({
      id: "parent-reviewer-main-tool-payload",
      type: "main",
      llm: {} as never,
    });

    taskOrchestrator.getExecutor = (() =>
      ({
        execute: async (
          conversation: Parameters<ReturnType<typeof taskOrchestrator.getExecutor>["execute"]>[0],
        ) => {
          conversation.memory.addMessage({
            role: "assistant",
            type: "message",
            partial: false,
            content: [
              "<review_decision>request_changes</review_decision>",
              "<review_summary>检查发现真实产物与 completeTask 不一致。</review_summary>",
              "<review_feedback>请补充 runChecks 并修正文档中的验证结论。</review_feedback>",
            ].join("\n"),
          });
          conversation.status = "completed";
        },
      }) as unknown as ReturnType<
        typeof taskOrchestrator.getExecutor
      >) as typeof taskOrchestrator.getExecutor;

    const decision = await evaluateAmigoSubTaskWaitReview({
      subTaskId: "sub-reviewer-2",
      pendingPayload: {
        summary: "done",
        result:
          "## 交付物\n已更新实现。\n\n## 验证\nrunChecks: typecheck\n\n## 遗留问题\n无\n\n## 下游说明\n可继续联调。",
      },
      taskDescription: "Task 1.2: 修复 bar.ts",
      parentTaskId: parent.id,
      parentMessages: [],
      subTaskMessages: [],
      toolNames: ["completeTask", "runChecks"],
      context: undefined,
    });

    expect(decision).toEqual({
      action: "request_changes",
      message: "检查发现真实产物与 completeTask 不一致。",
      feedback: "请补充 runChecks 并修正文档中的验证结论。",
    });
    expect(conversationRepository.getAll()).toHaveLength(1);
  });
});

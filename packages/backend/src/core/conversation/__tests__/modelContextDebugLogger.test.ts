import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setGlobalState } from "@/globalState";
import {
  createModelContextDebugSession,
  extractCompletedSegments,
} from "../context/modelContextDebugLogger";

describe("modelContextDebugLogger", () => {
  afterEach(() => {
    setGlobalState("globalCachePath", undefined as never);
    setGlobalState("conversationPersistenceProvider", undefined);
  });

  it("extracts completed multilingual sentence-like segments", () => {
    const text = "第一句。Second sentence! Third line\nFourth";
    const result = extractCompletedSegments(text, 0);

    expect(result.segments).toEqual(["第一句。", "Second sentence!", "Third line"]);
    expect(text.slice(result.nextIndex)).toBe("Fourth");
  });

  it("ignores empty trailing delimiters and preserves remaining text", () => {
    const text = "Alpha。\n\nBeta";
    const result = extractCompletedSegments(text, 0);

    expect(result.segments).toEqual(["Alpha。"]);
    expect(text.slice(result.nextIndex)).toBe("Beta");
  });

  it("can operate with a temp cache root", () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-model-context-debug-"));
    setGlobalState("globalCachePath", tempRoot);

    const result = extractCompletedSegments("One. Two", 0);
    expect(result.segments).toEqual(["One."]);

    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("forwards context snapshots to the persistence provider when available", () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-model-context-debug-"));
    const recordModelContextSnapshot = mock();
    setGlobalState("globalCachePath", tempRoot);
    setGlobalState("conversationPersistenceProvider", {
      exists: () => false,
      load: () => null,
      save: () => true,
      delete: () => true,
      listConversationRelations: () => [],
      listSessionHistories: () => [],
      recordModelContextSnapshot,
    });

    createModelContextDebugSession({
      conversationId: "conv-1",
      conversationType: "sub",
      workflowPhase: "execution",
      agentRole: "execution_worker",
      llm: {
        model: "test-model",
        provider: "test-provider",
      } as any,
      messages: [{ role: "system", content: "SYSTEM" } as any],
      options: {
        tools: [{ name: "taskList" } as any],
      },
    });

    expect(recordModelContextSnapshot).toHaveBeenCalledTimes(1);
    expect(recordModelContextSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        conversationType: "sub",
        workflowPhase: "execution",
        agentRole: "execution_worker",
        toolNames: ["taskList"],
        messageCount: 1,
      }),
    );

    rmSync(tempRoot, { recursive: true, force: true });
  });
});

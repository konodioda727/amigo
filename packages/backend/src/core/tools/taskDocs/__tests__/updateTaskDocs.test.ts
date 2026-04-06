import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setGlobalState } from "@/globalState";
import { ReadTaskDocs } from "../readTaskDocs";
import { UpdateTaskDocs } from "../updateTaskDocs";

const buildContext = (taskId: string) => ({
  taskId,
  parentId: undefined,
  getSandbox: async () => ({}),
  getToolByName: () => undefined,
  signal: undefined,
});

describe("updateTaskDocs", () => {
  let tempStoragePath: string;

  beforeEach(() => {
    tempStoragePath = mkdtempSync(path.join(os.tmpdir(), "amigo-taskdocs-"));
    setGlobalState("globalStoragePath", tempStoragePath);
  });

  afterEach(() => {
    rmSync(tempStoragePath, { recursive: true, force: true });
  });

  it("updates requirements.md with unique oldString/newString replacement", async () => {
    const taskId = "task-update-search-replace";

    await UpdateTaskDocs.invoke({
      params: {
        phase: "requirements",
        content: ["# Requirements", "", "- Scope: MVP", "- Success: ship this week"].join("\n"),
      },
      context: buildContext(taskId),
    });

    const result = await UpdateTaskDocs.invoke({
      params: {
        phase: "requirements",
        oldString: "- Scope: MVP",
        newString: "- Scope: MVP with admin dashboard",
      },
      context: buildContext(taskId),
    });

    expect(result.transport.result.success).toBe(true);
    expect(result.transport.result.updatedContent).toContain("MVP with admin dashboard");
    expect(result.continuation.summary).toBe("【已更新 requirements.md】");
    expect(result.continuation.result.updatedContent).toBeUndefined();

    const filePath = path.join(tempStoragePath, taskId, "taskDocs", "requirements.md");
    expect(readFileSync(filePath, "utf-8")).toContain("MVP with admin dashboard");
  });

  it("creates a missing requirements.md on first write", async () => {
    const taskId = "task-update-first-write";

    const result = await UpdateTaskDocs.invoke({
      params: {
        phase: "requirements",
        content: ["# Requirements", "", "- Goal: launch beta"].join("\n"),
      },
      context: buildContext(taskId),
    });

    expect(result.transport.result.success).toBe(true);
    expect(result.transport.result.updatedContent).toContain("launch beta");

    const filePath = path.join(tempStoragePath, taskId, "taskDocs", "requirements.md");
    expect(readFileSync(filePath, "utf-8")).toContain("launch beta");
  });

  it("rejects line patch when expectedOriginalContent is stale", async () => {
    const taskId = "task-update-stale-line-patch";

    await UpdateTaskDocs.invoke({
      params: {
        phase: "design",
        content: ["# Design", "", "Chosen approach: option A", "Risk: medium"].join("\n"),
      },
      context: buildContext(taskId),
    });

    const result = await UpdateTaskDocs.invoke({
      params: {
        phase: "design",
        startLine: 3,
        endLine: 3,
        expectedOriginalContent: "Chosen approach: option B",
        content: "Chosen approach: option C",
      },
      context: buildContext(taskId),
    });

    expect(result.transport.result.success).toBe(false);
    expect(result.transport.result.message).toContain("目标行内容已发生变化");
  });

  it("returns numberedContent for readTaskDocs so patches can target stable lines", async () => {
    const taskId = "task-read-numbered";

    await UpdateTaskDocs.invoke({
      params: {
        phase: "requirements",
        content: [
          "# Requirements",
          "",
          "- Goal: faster onboarding",
          "- Constraint: no new backend",
        ].join("\n"),
      },
      context: buildContext(taskId),
    });

    const result = await ReadTaskDocs.invoke({
      params: {
        phase: "requirements",
      },
      context: buildContext(taskId),
    });

    expect(result.transport.result.success).toBe(true);
    expect(result.transport.result.documents.requirements?.content).toContain("faster onboarding");
    expect(result.transport.result.documents.requirements?.numberedContent).toContain(
      "   1| # Requirements",
    );
    expect(result.transport.result.documents.requirements?.numberedContent).toContain(
      "   4| - Constraint: no new backend",
    );
    expect(result.transport.result.documents.requirements?.totalLines).toBe(4);
    expect(result.continuation.summary).toBe("【已阅读 requirements.md】");
  });
});

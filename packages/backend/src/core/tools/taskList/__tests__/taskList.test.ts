import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setGlobalState } from "@/globalState";
import { TaskList } from "../taskList";

describe("taskList tool", () => {
  let tempStorageRoot = "";

  beforeEach(() => {
    tempStorageRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-task-list-"));
    setGlobalState("globalStoragePath", tempStorageRoot);
  });

  afterEach(() => {
    rmSync(tempStorageRoot, { recursive: true, force: true });
    setGlobalState("globalStoragePath", undefined);
  });

  it("writes a minimal checklist and can read it back", async () => {
    const writeResult = await TaskList.invoke({
      params: {
        action: "replace",
        tasks: [
          { id: "init-repo", title: "梳理状态流转", deps: [] },
          { id: "T1", title: "切换到 taskList 调度", deps: ["init-repo"] },
        ],
      },
      context: {
        taskId: "task-list-main",
        parentId: undefined,
        getSandbox: async () => ({}) as never,
        getToolByName: () => undefined,
        signal: undefined,
        agentRole: "controller",
        currentPhase: "design",
      },
    });

    expect(writeResult.error).toBeUndefined();
    expect(writeResult.transport.result.markdown).toContain(
      "- [ ] Task init-repo: 梳理状态流转 [deps: none]",
    );
    expect(writeResult.transport.result.markdown).toContain(
      "- [ ] Task T1: 切换到 taskList 调度 [deps: Task init-repo]",
    );

    const readResult = await TaskList.invoke({
      params: {
        action: "read",
      },
      context: {
        taskId: "task-list-main",
        parentId: undefined,
        getSandbox: async () => ({}) as never,
        getToolByName: () => undefined,
        signal: undefined,
        agentRole: "controller",
        currentPhase: "execution",
      },
    });

    expect(readResult.error).toBeUndefined();
    expect(readResult.transport.result.tasks).toEqual([
      {
        id: "init-repo",
        title: "梳理状态流转",
        deps: [],
        completed: false,
      },
      {
        id: "T1",
        title: "切换到 taskList 调度",
        deps: ["init-repo"],
        completed: false,
      },
    ]);
  });
});

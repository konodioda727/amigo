import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { StorageType } from "@amigo-llm/types";
import { setGlobalState } from "@/globalState";

const destroySandbox = mock(async () => {});

mock.module("@/core/sandbox/SandboxRegistry", () => ({
  sandboxRegistry: {
    has: () => true,
    destroy: destroySandbox,
  },
}));

import { ConversationRepository } from "../ConversationRepository";

function writeTask(storageRoot: string, taskId: string, fatherTaskId?: string): void {
  const taskRoot = path.join(storageRoot, taskId);
  mkdirSync(path.join(taskRoot, "messages"), { recursive: true });

  const now = new Date().toISOString();
  writeFileSync(
    path.join(taskRoot, `${StorageType.TASK_STATUS}.json`),
    JSON.stringify(
      {
        taskId,
        fatherTaskId,
        conversationStatus: "idle",
        toolNames: [],
        createdAt: now,
        updatedAt: now,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

describe("ConversationRepository.deleteWithChildren", () => {
  let tempStorageRoot = "";

  beforeEach(() => {
    tempStorageRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-delete-"));
    setGlobalState("globalStoragePath", tempStorageRoot);
    destroySandbox.mockClear();
  });

  afterEach(() => {
    rmSync(tempStorageRoot, { recursive: true, force: true });
  });

  it("deletes disk-only child sessions when deleting parent session", async () => {
    const parentTaskId = "task-parent";
    const childTaskId = "task-child";
    const grandChildTaskId = "task-grand-child";

    writeTask(tempStorageRoot, parentTaskId);
    writeTask(tempStorageRoot, childTaskId, parentTaskId);
    writeTask(tempStorageRoot, grandChildTaskId, childTaskId);

    const repository = new ConversationRepository();

    const deletedIds = await repository.deleteWithChildren(parentTaskId);

    expect(new Set(deletedIds)).toEqual(new Set([parentTaskId, childTaskId, grandChildTaskId]));
    expect(existsSync(path.join(tempStorageRoot, parentTaskId))).toBe(false);
    expect(existsSync(path.join(tempStorageRoot, childTaskId))).toBe(false);
    expect(existsSync(path.join(tempStorageRoot, grandChildTaskId))).toBe(false);
    expect(destroySandbox).toHaveBeenCalledWith(parentTaskId);
  });
});

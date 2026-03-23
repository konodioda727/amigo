import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { StorageType, type TaskStatusMetadata } from "@amigo-llm/types";
import { fileConversationPersistenceProvider } from "@/core/persistence";
import { setGlobalState } from "@/globalState";
import { getSessionHistories } from "./getSessions";

const writeTask = ({
  storageRoot,
  taskId,
  title,
  updatedAt,
  fatherTaskId,
  context,
}: {
  storageRoot: string;
  taskId: string;
  title: string;
  updatedAt: string;
  fatherTaskId?: string;
  context?: TaskStatusMetadata["context"];
}) => {
  const taskRoot = path.join(storageRoot, taskId);
  mkdirSync(path.join(taskRoot, "messages"), { recursive: true });

  writeFileSync(
    path.join(taskRoot, `${StorageType.TASK_STATUS}.json`),
    JSON.stringify(
      {
        taskId,
        fatherTaskId,
        conversationStatus: "idle",
        toolNames: [],
        context,
        createdAt: updatedAt,
        updatedAt,
      } satisfies TaskStatusMetadata,
      null,
      2,
    ),
    "utf-8",
  );

  writeFileSync(
    path.join(taskRoot, "messages", `${StorageType.FRONT_END}.json`),
    JSON.stringify(
      {
        updatedAt,
        messages: [
          {
            type: "userSendMessage",
            data: {
              message: title,
            },
          },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );
};

describe("getSessionHistories", () => {
  let tempStorageRoot = "";

  beforeEach(() => {
    tempStorageRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-sessions-"));
    setGlobalState("globalStoragePath", tempStorageRoot);
    setGlobalState("conversationPersistenceProvider", fileConversationPersistenceProvider);
  });

  afterEach(() => {
    rmSync(tempStorageRoot, { recursive: true, force: true });
    setGlobalState("conversationPersistenceProvider", undefined);
  });

  it("filters out sub tasks and automation-triggered conversations", async () => {
    writeTask({
      storageRoot: tempStorageRoot,
      taskId: "user-task",
      title: "用户对话",
      updatedAt: "2026-03-22T09:00:00.000Z",
    });
    writeTask({
      storageRoot: tempStorageRoot,
      taskId: "sub-task",
      title: "子任务",
      updatedAt: "2026-03-22T09:10:00.000Z",
      fatherTaskId: "user-task",
    });
    writeTask({
      storageRoot: tempStorageRoot,
      taskId: "automation-task",
      title: "自动化任务",
      updatedAt: "2026-03-22T09:20:00.000Z",
      context: { trigger: "automation", automationId: "daily-report" },
    });

    const histories = await getSessionHistories();

    expect(histories).toEqual([
      {
        taskId: "user-task",
        title: "用户对话",
        updatedAt: "2026-03-22T09:00:00.000Z",
      },
    ]);
  });

  it("sorts remaining user conversations by updatedAt descending", async () => {
    writeTask({
      storageRoot: tempStorageRoot,
      taskId: "older-task",
      title: "较早会话",
      updatedAt: "2026-03-22T08:00:00.000Z",
    });
    writeTask({
      storageRoot: tempStorageRoot,
      taskId: "newer-task",
      title: "较新会话",
      updatedAt: "2026-03-22T10:00:00.000Z",
    });

    const histories = await getSessionHistories();

    expect(histories.map((history) => history.taskId)).toEqual(["newer-task", "older-task"]);
  });
});

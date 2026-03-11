import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { StorageType } from "@amigo-llm/types";
import { setGlobalState } from "@/globalState";

const conversationGet = mock(() => undefined);
const conversationLoad = mock(() => undefined);

mock.module("@/core/conversation", () => ({
  conversationRepository: {
    get: conversationGet,
    load: conversationLoad,
  },
}));

import { getGithubSandboxBindingForTask } from "./bootstrap";

describe("getGithubSandboxBindingForTask", () => {
  let tempStorageRoot = "";
  let tempCacheRoot = "";

  beforeEach(() => {
    tempStorageRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-github-storage-"));
    tempCacheRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-github-cache-"));
    setGlobalState("globalStoragePath", tempStorageRoot);
    setGlobalState("globalCachePath", tempCacheRoot);
  });

  afterEach(() => {
    rmSync(tempStorageRoot, { recursive: true, force: true });
    rmSync(tempCacheRoot, { recursive: true, force: true });
  });

  it("returns repoUrl alongside mirror binding data", async () => {
    const taskId = "task-1";
    const repoUrl = "https://github.com/example/amigo.git";
    const commitSha = "0123456789abcdef0123456789abcdef01234567";
    const taskRoot = path.join(tempStorageRoot, taskId);
    const mirrorPath = path.join(
      tempCacheRoot,
      "github-bootstrap",
      "mirrors",
      `${Bun.hash(repoUrl.trim().toLowerCase()).toString(16)}.git`,
    );

    mkdirSync(taskRoot, { recursive: true });
    writeFileSync(
      path.join(taskRoot, `${StorageType.TASK_STATUS}.json`),
      JSON.stringify(
        {
          taskId,
          conversationStatus: "idle",
          toolNames: [],
          context: {
            repoUrl,
            branch: "main",
            commitSha,
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    mkdirSync(mirrorPath, { recursive: true });

    const binding = await getGithubSandboxBindingForTask(taskId);

    expect(binding).toEqual({
      mirrorPath,
      branch: "main",
      commitSha,
      repoUrl,
    });
  });
});

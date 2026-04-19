import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setGlobalState } from "@/globalState";

const persistenceLoad = mock((_taskId: string): Record<string, unknown> | null => null);
let tempCacheRoot = "";

import { getGithubSandboxBindingForTask } from "./bootstrap";

describe("getGithubSandboxBindingForTask", () => {
  beforeEach(() => {
    tempCacheRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-github-cache-"));
    setGlobalState("globalCachePath", tempCacheRoot);
    setGlobalState("conversationPersistenceProvider", {
      exists: () => false,
      load: persistenceLoad,
      save: () => true,
      delete: () => true,
      listConversationRelations: () => [],
      listSessionHistories: () => [],
    });
    persistenceLoad.mockReset();
  });

  afterEach(() => {
    rmSync(tempCacheRoot, { recursive: true, force: true });
    setGlobalState("conversationPersistenceProvider", undefined);
  });

  it("returns repoUrl alongside mirror binding data", async () => {
    const taskId = "task-1";
    const repoUrl = "https://github.com/example/amigo.git";
    const commitSha = "0123456789abcdef0123456789abcdef01234567";
    const mirrorPath = path.join(
      tempCacheRoot,
      "github-bootstrap",
      "mirrors",
      `${Bun.hash(repoUrl.trim().toLowerCase()).toString(16)}.git`,
    );

    persistenceLoad.mockImplementation((loadedTaskId: string) =>
      loadedTaskId === taskId
        ? {
            taskId,
            conversationStatus: "idle",
            toolNames: [],
            context: {
              repoUrl,
              branch: "main",
              commitSha,
            },
          }
        : null,
    );
    mkdirSync(path.dirname(mirrorPath), { recursive: true });
    mkdirSync(mirrorPath, { recursive: true });

    const binding = await getGithubSandboxBindingForTask(taskId);

    expect(persistenceLoad).toHaveBeenCalledWith(taskId);
    expect(binding).toEqual({
      mirrorPath,
      branch: "main",
      commitSha,
      repoUrl,
    });
  });
});

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ToolExecutionContext } from "@amigo-llm/types";
import { setGlobalState } from "../../../../../../backend/src/globalState";
import { upsertModuleDraftsTool } from "../draftTools";
import { readStoredModuleDraft } from "../storage";

const createContext = (taskId = "task-1"): ToolExecutionContext =>
  ({
    taskId,
    getSandbox: async () => null,
    getToolByName: () => undefined,
  }) as ToolExecutionContext;

describe("module draft tools", () => {
  let tempStorageRoot = "";
  let tempCacheRoot = "";

  beforeEach(() => {
    tempStorageRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-design-draft-storage-"));
    tempCacheRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-design-draft-cache-"));
    setGlobalState("globalStoragePath", tempStorageRoot);
    setGlobalState("globalCachePath", tempCacheRoot);
  });

  afterEach(() => {
    rmSync(tempStorageRoot, { recursive: true, force: true });
    rmSync(tempCacheRoot, { recursive: true, force: true });
  });

  it("accepts object-style asset references and normalizes them into ids", async () => {
    const result = await upsertModuleDraftsTool.invoke({
      params: {
        draftId: "Landing Draft",
        modules: [
          {
            moduleId: "Hero Banner",
            title: "Hero",
            html: '<section data-module-id="hero-banner"><div>Hero</div></section>',
            assetsUsed: [{ assetId: "gallery/Hero Cover" }, { assetId: "icons/Play Button" }],
            copySummary: "主标题 + 副标题 + CTA",
          },
        ],
      },
      context: createContext(),
    });

    expect(result.toolResult.success).toBe(true);
    expect(result.toolResult.validationErrors).toEqual([]);
    expect(result.toolResult.modules[0]?.previewPath).toBe(
      "/api/tasks/task-1/final-design-drafts/landing-draft/modules/hero-banner/preview",
    );

    const stored = readStoredModuleDraft("task-1", "landing-draft", "hero-banner");
    expect(stored?.assetsUsed).toEqual(["gallery-hero-cover", "icons-play-button"]);
    expect(stored?.copySummary).toBe("主标题 + 副标题 + CTA");
  });
});

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ToolExecutionContext } from "@amigo-llm/types";
import { setGlobalState } from "../../../../../../backend/src/globalState";
import { upsertLayoutOptionsTool } from "../layoutTools";
import { upsertDesignSessionTool } from "../sessionTools";
import { readStoredLayoutDraftOptions, readStoredLayoutOptions } from "../storage";

const createContext = (taskId = "task-layout"): ToolExecutionContext =>
  ({
    taskId,
    getSandbox: async () => null,
    getToolByName: () => undefined,
  }) as ToolExecutionContext;

const createValidSource = (moduleId: string, accentClass = "bg-zinc-200") =>
  `
<section data-module-id="${moduleId}" class="px-8 py-10">
  <div class="flex flex-col gap-4">
    <div class="h-10 w-40 rounded ${accentClass}"></div>
    <div class="h-4 w-72 rounded bg-zinc-100"></div>
    <div class="h-4 w-64 rounded bg-zinc-100"></div>
    <div class="h-12 w-32 rounded bg-zinc-300"></div>
    <div class="h-48 w-full rounded bg-zinc-100"></div>
    <div class="h-20 w-full rounded border border-zinc-200"></div>
  </div>
</section>
`.trim();

describe("layout draft persistence", () => {
  let tempStorageRoot = "";
  let tempCacheRoot = "";

  beforeEach(() => {
    tempStorageRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-layout-storage-"));
    tempCacheRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-layout-cache-"));
    setGlobalState("globalStoragePath", tempStorageRoot);
    setGlobalState("globalCachePath", tempCacheRoot);
  });

  afterEach(() => {
    rmSync(tempStorageRoot, { recursive: true, force: true });
    rmSync(tempCacheRoot, { recursive: true, force: true });
  });

  it("persists failed initial layout submissions as draft options", async () => {
    const context = createContext();
    await upsertDesignSessionTool.invoke({
      params: {
        pageGoal: "test",
        targetAudience: "test",
        brandMood: "test",
        modules: [{ id: "hero", label: "Hero", summary: "hero", priority: "primary" }],
      },
      context,
    });

    const result = await upsertLayoutOptionsTool.invoke({
      params: {
        options: [
          {
            layoutId: "hero-layout-a",
            title: "Hero A",
            source: createValidSource("hero"),
          },
        ],
      },
      context,
    });

    expect(result.toolResult.success).toBe(false);
    expect(result.toolResult.validationErrors[0]).toContain(
      "初次生成布局时必须一次提供 2 个合法布局方案",
    );

    const drafts = readStoredLayoutDraftOptions("task-layout");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.layoutId).toBe("hero-layout-a");
    expect(drafts[0]?.validationErrors).toContain("初次生成布局时必须一次提供 2 个合法布局方案");
    expect(readStoredLayoutOptions("task-layout")).toHaveLength(0);
  });

  it("can patch from a stored draft option and promote it on the next successful batch", async () => {
    const context = createContext();
    await upsertDesignSessionTool.invoke({
      params: {
        pageGoal: "test",
        targetAudience: "test",
        brandMood: "test",
        modules: [{ id: "hero", label: "Hero", summary: "hero", priority: "primary" }],
      },
      context,
    });

    await upsertLayoutOptionsTool.invoke({
      params: {
        options: [
          {
            layoutId: "hero-layout-a",
            title: "Hero A",
            source: createValidSource("hero", "bg-zinc-100"),
          },
        ],
      },
      context,
    });

    const result = await upsertLayoutOptionsTool.invoke({
      params: {
        options: [
          {
            layoutId: "hero-layout-a",
            search: "bg-zinc-100",
            replace: "bg-zinc-200",
          },
          {
            layoutId: "hero-layout-b",
            title: "Hero B",
            source: createValidSource("hero", "bg-zinc-300"),
          },
        ],
      },
      context,
    });

    expect(result.toolResult.success).toBe(true);
    expect(readStoredLayoutOptions("task-layout").map((item) => item.layoutId)).toEqual([
      "hero-layout-a",
      "hero-layout-b",
    ]);
    expect(readStoredLayoutOptions("task-layout")[0]?.source).toContain("bg-zinc-200");
    expect(readStoredLayoutDraftOptions("task-layout")).toHaveLength(0);
  });
});

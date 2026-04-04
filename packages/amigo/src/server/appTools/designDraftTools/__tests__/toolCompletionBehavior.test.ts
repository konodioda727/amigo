import { describe, expect, it } from "bun:test";
import {
  orchestrateFinalDesignDraftTool,
  readDesignSessionTool,
  readDraftCritiqueTool,
  readFinalDesignDraftTool,
  readLayoutOptionsTool,
  readModuleDraftsTool,
  readThemeOptionsTool,
  upsertDesignSessionTool,
  upsertLayoutOptionsTool,
  upsertModuleDraftsTool,
  upsertThemeOptionsTool,
} from "..";

describe("design draft tools completion behavior", () => {
  it("only keeps user-selection tools in idle mode", () => {
    const idleTools = [
      upsertLayoutOptionsTool,
      upsertThemeOptionsTool,
      orchestrateFinalDesignDraftTool,
    ];

    for (const tool of idleTools) {
      expect(tool.completionBehavior).toBe("idle");
    }

    const continuingTools = [
      readFinalDesignDraftTool,
      readModuleDraftsTool,
      upsertModuleDraftsTool,
      readDraftCritiqueTool,
    ];

    for (const tool of continuingTools) {
      expect(tool.completionBehavior).toBeUndefined();
    }

    expect(readDesignSessionTool.completionBehavior).toBeUndefined();
    expect(readLayoutOptionsTool.completionBehavior).toBeUndefined();
    expect(readThemeOptionsTool.completionBehavior).toBeUndefined();
    expect(upsertDesignSessionTool.completionBehavior).toBeUndefined();
  });
});

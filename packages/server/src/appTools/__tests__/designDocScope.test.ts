import { describe, expect, it } from "bun:test";
import { resolveDesignDocOwnerTaskId } from "../designDocScope";

describe("resolveDesignDocOwnerTaskId", () => {
  it("prefers parent task scope for sub tasks", () => {
    expect(resolveDesignDocOwnerTaskId("sub-task", "parent-task")).toBe("parent-task");
  });

  it("falls back to current task scope when parent is absent", () => {
    expect(resolveDesignDocOwnerTaskId("main-task")).toBe("main-task");
  });
});

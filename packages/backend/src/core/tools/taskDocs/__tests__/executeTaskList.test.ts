import { describe, expect, it, mock } from "bun:test";

mock.module("@/core/model", () => ({
  getLlm: mock(),
}));

import { SubTaskInterruptedError } from "@/core/conversation";
import { resolveSubTaskFailureState } from "../executeTaskList";

describe("resolveSubTaskFailureState", () => {
  it("maps interrupted subTasks back to wait_review", () => {
    const result = resolveSubTaskFailureState(new SubTaskInterruptedError("sub-task-1"));

    expect(result).toMatchObject({
      summary: "任务被用户打断，已保留为待审核状态。",
      outcome: "interrupted",
      status: "wait_review",
      error: undefined,
      completedAt: undefined,
    });
  });

  it("keeps genuine execution errors as failed", () => {
    const result = resolveSubTaskFailureState(new Error("boom"));

    expect(result.summary).toBe("任务执行失败: boom");
    expect(result.outcome).toBe("failed");
    expect(result.status).toBe("failed");
    expect(result.error).toBe("boom");
    expect(result.completedAt).toEqual(expect.any(String));
  });
});

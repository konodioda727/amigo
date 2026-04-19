import { describe, expect, it } from "bun:test";
import {
  AMIGO_EXECUTION_WORKER_COMPLETION_PROMPT,
  evaluateAmigoTaskExecutionVerification,
} from "../codingTaskExecutionPolicy";

describe("codingTaskExecutionPolicy", () => {
  it("documents the execution worker completion discipline", () => {
    expect(AMIGO_EXECUTION_WORKER_COMPLETION_PROMPT).toContain("finishPhase");
    expect(AMIGO_EXECUTION_WORKER_COMPLETION_PROMPT).toContain("## 验证");
    expect(AMIGO_EXECUTION_WORKER_COMPLETION_PROMPT).toContain("不要把“还在排查");
    expect(AMIGO_EXECUTION_WORKER_COMPLETION_PROMPT).toContain("LSP/diagnostics");
    expect(AMIGO_EXECUTION_WORKER_COMPLETION_PROMPT).toContain("build、lint");
    expect(AMIGO_EXECUTION_WORKER_COMPLETION_PROMPT).toContain("真实链路上的集成测试");
    expect(AMIGO_EXECUTION_WORKER_COMPLETION_PROMPT).toContain("不要只写孤立模块测试、纯单元测试");
  });

  it("bypasses the legacy independent reviewer flow", async () => {
    const decision = await evaluateAmigoTaskExecutionVerification({
      executionTaskId: "sub-reviewer-1",
      pendingPayload: {
        summary: "done",
        result:
          "## 交付物\n已更新实现。\n\n## 验证\nbash: bun run typecheck\n\n## 遗留问题\n无\n\n## 下游说明\n可继续联调。",
      },
      taskDescription: "Task 1.1: 修复 foo.ts",
      parentTaskId: "parent-reviewer-main",
      parentMessages: [],
      executionTaskMessages: [],
      toolNames: ["finishPhase", "bash"],
      context: undefined,
    });

    expect(decision).toEqual({
      action: "defer",
      message: "执行任务 sub-reviewer-1 不再触发独立 reviewer，直接使用子任务自检结果。",
    });
  });
});

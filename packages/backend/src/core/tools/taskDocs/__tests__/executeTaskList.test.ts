import { describe, expect, it } from "bun:test";
import { SubTaskInterruptedError } from "@/core/conversation";
import { parseChecklist } from "@/core/templates/checklistParser";
import { resolveSubTaskFailureState, runTaskScheduler } from "../executeTaskList";

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

describe("runTaskScheduler", () => {
  it("waits for reviewed dependencies to complete before scheduling downstream tasks", async () => {
    let taskListSnapshot = parseChecklist(
      ["- [ ] Task 1.1: 生成 hero 模块", "- [ ] Task 2.1: 整页整合 [deps: Task 1.1]"].join("\n"),
    ).items;

    const executionTypeByTaskId = new Map<string, "new" | "wait_review">([
      ["1.1", "new"],
      ["2.1", "new"],
    ]);
    const launchedTasks: string[] = [];
    let blockedWaits = 0;

    await runTaskScheduler({
      readAllTasks: () => taskListSnapshot,
      runningTaskIds: new Set<string>(),
      getExecutionType: (item) =>
        executionTypeByTaskId.get(item.description.match(/^Task\s+([\d.]+)/)?.[1] || "") || "new",
      onRunTask: async (taskItem) => {
        const taskId = taskItem.description.match(/^Task\s+([\d.]+)/)?.[1] || "";
        launchedTasks.push(taskId);

        if (taskId === "1.1") {
          executionTypeByTaskId.set("1.1", "wait_review");
          return {
            target: taskItem.description,
            success: false,
            outcome: "wait_review",
            summary: "hero 模块待审核",
          };
        }

        taskListSnapshot = parseChecklist(
          ["- [x] Task 1.1: 生成 hero 模块", "- [x] Task 2.1: 整页整合 [deps: Task 1.1]"].join(
            "\n",
          ),
        ).items;

        return {
          target: taskItem.description,
          success: true,
          outcome: "success",
          summary: "整页整合完成",
        };
      },
      onBlocked: async () => {
        blockedWaits += 1;
        taskListSnapshot = parseChecklist(
          ["- [x] Task 1.1: 生成 hero 模块", "- [ ] Task 2.1: 整页整合 [deps: Task 1.1]"].join(
            "\n",
          ),
        ).items;
      },
    });

    expect(blockedWaits).toBe(1);
    expect(launchedTasks).toEqual(["1.1", "2.1"]);
  });
});

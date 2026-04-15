import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ExecutionTaskInterruptedError } from "@/core/conversation/orchestration/conversationOrchestratorExecution";
import { getTaskId, parseChecklist } from "@/core/templates/checklistParser";
import { resolveExecutionTaskFailureState, runTaskScheduler } from "../executeTaskListScheduler";
import {
  buildExecutionWorkerConversationContext,
  buildSubAgentPrompt,
  resolveExecutionWorkerTools,
} from "../executeTaskListShared";

describe("resolveExecutionTaskFailureState", () => {
  it("maps interrupted execution tasks to interrupted state", () => {
    const result = resolveExecutionTaskFailureState(
      new ExecutionTaskInterruptedError("execution-task-1"),
    );

    expect(result).toMatchObject({
      summary: "任务被用户打断，执行未完成。",
      outcome: "interrupted",
      status: "interrupted",
      error: "任务被用户打断",
      completedAt: expect.any(String),
    });
  });

  it("keeps genuine execution errors as failed", () => {
    const result = resolveExecutionTaskFailureState(new Error("boom"));

    expect(result.summary).toBe("任务执行失败: boom");
    expect(result.outcome).toBe("failed");
    expect(result.status).toBe("failed");
    expect(result.error).toBe("boom");
    expect(result.completedAt).toEqual(expect.any(String));
  });
});

describe("runTaskScheduler", () => {
  it("schedules root tasks when execution doc uses '[deps: none]'", async () => {
    const allTasks = parseChecklist(
      ["- [ ] Task 1.0: 初始化项目 [deps: none]", "- [ ] Task 2.0: 继续实现 [deps: Task 1.0]"].join(
        "\n",
      ),
    ).items;

    const launchedTasks: string[] = [];
    const completedTaskIds = new Set<string>();

    await runTaskScheduler({
      allTasks,
      runningTaskIds: new Set<string>(),
      completedTaskIds,
      getExecutionType: () => "new",
      onRunTask: async (taskItem) => {
        const taskId = getTaskId(taskItem.description) || "";
        launchedTasks.push(taskId);
        completedTaskIds.add(taskId);
        return {
          target: taskItem.description,
          success: true,
          outcome: "success",
          summary: `${taskId} 完成`,
        };
      },
    });

    expect(launchedTasks).toEqual(["1.0", "2.0"]);
  });

  it("waits for completed dependencies before scheduling downstream tasks", async () => {
    const allTasks = parseChecklist(
      ["- [ ] Task T1: 生成 hero 模块", "- [ ] Task integrate-page: 整页整合 [deps: Task T1]"].join(
        "\n",
      ),
    ).items;

    const executionTypeByTaskId = new Map<string, "new">([
      ["T1", "new"],
      ["integrate-page", "new"],
    ]);
    const launchedTasks: string[] = [];
    const completedTaskIds = new Set<string>();

    await runTaskScheduler({
      allTasks,
      runningTaskIds: new Set<string>(),
      completedTaskIds,
      getExecutionType: (item) =>
        executionTypeByTaskId.get(getTaskId(item.description) || "") || "new",
      onRunTask: async (taskItem) => {
        const taskId = getTaskId(taskItem.description) || "";
        launchedTasks.push(taskId);

        if (taskId === "T1") {
          completedTaskIds.add("T1");
          return {
            target: taskItem.description,
            success: true,
            outcome: "success",
            summary: "hero 模块完成",
          };
        }

        return {
          target: taskItem.description,
          success: true,
          outcome: "success",
          summary: "整页整合完成",
        };
      },
    });

    expect(launchedTasks).toEqual(["T1", "integrate-page"]);
  });

  it("stops scheduling remaining tasks after a failure", async () => {
    const allTasks = parseChecklist(
      [
        "- [ ] Task 1.0: 失败任务 [deps: none]",
        "- [ ] Task 2.0: 同批已启动任务 [deps: none]",
        "- [ ] Task 3.0: 不应继续执行 [deps: none]",
      ].join("\n"),
    ).items;

    const launchedTasks: string[] = [];

    await runTaskScheduler({
      allTasks,
      runningTaskIds: new Set<string>(),
      completedTaskIds: new Set<string>(),
      getExecutionType: () => "new",
      onRunTask: async (taskItem) => {
        const taskId = getTaskId(taskItem.description) || "";
        launchedTasks.push(taskId);
        return {
          target: taskItem.description,
          success: false,
          outcome: "failed",
          summary: "执行失败",
        };
      },
    });

    expect(launchedTasks).toEqual(["1.0", "2.0"]);
    expect(launchedTasks).not.toContain("3.0");
  });

  it("stops scheduling remaining tasks after an interruption", async () => {
    const allTasks = parseChecklist(
      [
        "- [ ] Task 1.0: 中断任务 [deps: none]",
        "- [ ] Task 2.0: 同批已启动任务 [deps: none]",
        "- [ ] Task 3.0: 不应继续执行 [deps: none]",
      ].join("\n"),
    ).items;

    const launchedTasks: string[] = [];

    await runTaskScheduler({
      allTasks,
      runningTaskIds: new Set<string>(),
      completedTaskIds: new Set<string>(),
      getExecutionType: () => "new",
      onRunTask: async (taskItem) => {
        const taskId = getTaskId(taskItem.description) || "";
        launchedTasks.push(taskId);
        return {
          target: taskItem.description,
          success: false,
          outcome: "interrupted",
          summary: "执行中断",
        };
      },
    });

    expect(launchedTasks).toEqual(["1.0", "2.0"]);
    expect(launchedTasks).not.toContain("3.0");
  });
});

describe("buildSubAgentPrompt", () => {
  it("keeps the sub-agent prompt focused on the execution task", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "execute-task-list-prompt-"));
    const boundFilePath = path.join(tempDir, "tmp-execute-task-list-prompt.ts");
    writeFileSync(boundFilePath, "export const value = 1;\n", "utf-8");

    const taskItem = parseChecklist(
      `- [ ] Task 1.1: 调整配置解析入口 [deps: none] [designSections: #Technical Decisions] [files: ${boundFilePath}]`,
    ).items[0];
    expect(taskItem).toBeDefined();
    if (!taskItem) {
      throw new Error("expected checklist item");
    }

    const prompt = buildSubAgentPrompt({
      cleanDescription: taskItem.description,
      availableToolNames: ["editFile", "readFile"],
      forbiddenTools: [],
      ignoredLegacyTools: [],
      dependencyResults: "",
      taskListContext: [
        "只把下面清单当成上下游参考。你只负责标记为 CURRENT 的这一项。",
        `- [CURRENT] L1 ${taskItem.rawLine?.trim()}`,
        "- [OTHER] L2 - [ ] Task 2.1: 整页整合 [deps: Task 1.1] | deps: 1.1",
      ].join("\n"),
      taskItem,
    });

    expect(prompt).toContain("继承了父任务 design 以来的会话历史");
    expect(prompt).toContain("任务清单上下文");
    expect(prompt).toContain("你只负责标记为 CURRENT 的这一项");
    expect(prompt).toContain("scope 只由任务目标和当前 task line 决定");
    expect(prompt).toContain("不要顺手实现、验证、勾选或提前交付后续任务");
    expect(prompt).toContain("默认先复用");
    expect(prompt).toContain("直接用 `editFile`");
    expect(prompt).toContain("`goToDefinition` / `findReferences` / `getDiagnostics`");
    expect(prompt).toContain("不要先用 `bash rg` 反复搜同一批 symbol");
    expect(prompt).toContain("先改这一处");
    expect(prompt).toContain("小步快跑、边改边验");
    expect(prompt).toContain("足以确定下一步修改动作");
    expect(prompt).toContain("不要回退去读 `build/` 产物");
    expect(prompt).toContain("让 controller 决定是否 `overridePhase` 回到 design");
    expect(prompt).toContain("## 交付物");
    expect(prompt).toContain("## 下游说明");
    expect(prompt).not.toContain("第一条先调用 `readTaskDocs`");
    expect(prompt).not.toContain("父任务 ID");
    expect(prompt).not.toContain("会自动读取父任务");
    expect(prompt).not.toContain("仅允许读取父任务的 `design.md`");
    expect(prompt).not.toContain("### Requirements");
    expect(prompt).not.toContain("### Design");
  });

  it("ignores legacy task-level tool config and auto-adds language intelligence tools when available", () => {
    const lspTool = (name: string) =>
      ({
        name,
        description: "",
        params: [],
        invoke: async () => ({}),
      }) as any;

    const resolved = resolveExecutionWorkerTools(
      "Task 1.1: 调整配置解析入口 [tools: shell, goToDefinition, findReferences]",
      (name) => {
        if (name === "goToDefinition" || name === "findReferences") {
          return lspTool(name);
        }
        return undefined;
      },
    );

    expect(resolved.cleanDescription).toBe("Task 1.1: 调整配置解析入口");
    expect(resolved.availableToolNames).toContain("editFile");
    expect(resolved.availableToolNames).toContain("goToDefinition");
    expect(resolved.availableToolNames).toContain("findReferences");
    expect(resolved.availableToolNames).not.toContain("shell");
    expect(resolved.ignoredLegacyTools).toEqual(["shell", "goToDefinition", "findReferences"]);
  });

  it("binds the full task list into execution worker conversation context", () => {
    const allTasks = parseChecklist(
      [
        "- [x] Task 1.0: 初始化项目 [deps: none]",
        "- [ ] Task 1.1: 调整配置解析入口 [deps: Task 1.0]",
        "- [ ] Task 2.0: 整页整合 [deps: Task 1.1]",
      ].join("\n"),
    ).items;
    const taskItem = allTasks[1];
    expect(taskItem).toBeDefined();
    if (!taskItem) {
      throw new Error("expected checklist item");
    }

    const context = buildExecutionWorkerConversationContext(taskItem, allTasks);

    expect(context).toEqual({
      executionTask: {
        rawTaskLine: "- [ ] Task 1.1: 调整配置解析入口 [deps: Task 1.0]",
        lineNumber: 2,
        designSectionRefs: [],
        fileRefs: [],
        taskList: [
          {
            rawTaskLine: "- [x] Task 1.0: 初始化项目 [deps: none]",
            lineNumber: 1,
            completed: true,
            dependencies: [],
            isCurrent: false,
          },
          {
            rawTaskLine: "- [ ] Task 1.1: 调整配置解析入口 [deps: Task 1.0]",
            lineNumber: 2,
            completed: false,
            dependencies: ["1.0"],
            isCurrent: true,
          },
          {
            rawTaskLine: "- [ ] Task 2.0: 整页整合 [deps: Task 1.1]",
            lineNumber: 3,
            completed: false,
            dependencies: ["1.1"],
            isCurrent: false,
          },
        ],
      },
    });
  });
});

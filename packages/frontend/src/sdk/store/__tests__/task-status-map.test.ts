import "../../provider/__tests__/setup";
import { describe, expect, test } from "bun:test";
import { createWebSocketStore } from "../createWebSocketStore";

describe("task status map synchronization", () => {
  test("registers running execution tasks as streaming so they can be interrupted immediately", () => {
    const store = createWebSocketStore({
      url: "ws://localhost:10013",
      autoConnect: false,
    });

    store.getState().setTaskStatusMap("parent-task", {
      "Task 1": {
        executionTaskId: "execution-task-1",
        status: "running",
      },
    });

    expect(store.getState().tasks["execution-task-1"]).toBeDefined();
    expect(store.getState().tasks["execution-task-1"]?.status).toBe("streaming");
  });

  test("maps execution task lifecycle states onto the frontend task state machine", () => {
    const store = createWebSocketStore({
      url: "ws://localhost:10013",
      autoConnect: false,
    });

    store.getState().registerTask("execution-task-1");

    store.getState().setTaskStatusMap("parent-task", {
      "Task 1": {
        executionTaskId: "execution-task-1",
        status: "interrupted",
      },
      "Task 2": {
        executionTaskId: "execution-task-2",
        status: "failed",
      },
      "Task 3": {
        executionTaskId: "execution-task-4",
        status: "completed",
      },
    });

    const { tasks } = store.getState();
    expect(tasks["execution-task-1"]?.status).toBe("interrupted");
    expect(tasks["execution-task-2"]?.status).toBe("error");
    expect(tasks["execution-task-4"]?.status).toBe("completed");
  });

  test("keeps backward compatibility for legacy waiting_user_input execution task states", () => {
    const store = createWebSocketStore({
      url: "ws://localhost:10013",
      autoConnect: false,
    });

    store.getState().setTaskStatusMap("parent-task", {
      "Task 1": {
        executionTaskId: "execution-task-legacy",
        status: "waiting_user_input",
      },
    });

    expect(store.getState().tasks["execution-task-legacy"]?.status).toBe("interrupted");
  });

  test("keeps an actively streaming execution task in streaming state after loading task history", () => {
    const store = createWebSocketStore({
      url: "ws://localhost:10013",
      autoConnect: false,
    });

    store.getState().processMessage({
      type: "taskHistory",
      data: {
        taskId: "execution-task-streaming",
        messages: [],
        conversationStatus: "streaming",
      },
    } as any);

    expect(store.getState().tasks["execution-task-streaming"]?.status).toBe("streaming");
  });

  test("stores task context usage snapshot from taskStatusMapUpdated messages", () => {
    const store = createWebSocketStore({
      url: "ws://localhost:10013",
      autoConnect: false,
    });

    store.getState().processMessage({
      type: "taskStatusMapUpdated",
      data: {
        taskId: "parent-task",
        executionTasks: {},
        contextUsage: {
          model: "qwen3-coder",
          contextWindow: 32000,
          estimatedTokens: 12000,
          usageRatio: 0.375,
          compressionThreshold: 0.8,
          targetRatio: 0.5,
          isCompressing: false,
          compressionCount: 1,
        },
      },
    } as any);

    expect(store.getState().taskContextUsageMaps["parent-task"]).toEqual(
      expect.objectContaining({
        model: "qwen3-coder",
        usageRatio: 0.375,
        compressionCount: 1,
      }),
    );
  });

  test("stores task context snapshot from taskStatusMapUpdated messages", () => {
    const store = createWebSocketStore({
      url: "ws://localhost:10013",
      autoConnect: false,
    });

    store.getState().processMessage({
      type: "taskStatusMapUpdated",
      data: {
        taskId: "parent-task",
        executionTasks: {},
        context: {
          repoUrl: "https://github.com/amigo/demo.git",
          branch: "main",
        },
      },
    } as any);

    expect(store.getState().taskContextMaps["parent-task"]).toEqual({
      repoUrl: "https://github.com/amigo/demo.git",
      branch: "main",
    });
  });

  test("stores workflow state snapshot from taskStatusMapUpdated messages", () => {
    const store = createWebSocketStore({
      url: "ws://localhost:10013",
      autoConnect: false,
    });

    store.getState().processMessage({
      type: "taskStatusMapUpdated",
      data: {
        taskId: "parent-task",
        executionTasks: {},
        workflowState: {
          currentPhase: "complete",
          agentRole: "controller",
          visitedPhases: ["complete"],
          skippedPhases: [],
          phaseStates: {
            requirements: { status: "skipped" },
            design: { status: "skipped" },
            execution: { status: "skipped" },
            verification: { status: "skipped" },
            complete: { status: "completed" },
          },
        },
      },
    } as any);

    expect(store.getState().taskWorkflowStateMaps["parent-task"]).toEqual(
      expect.objectContaining({
        currentPhase: "complete",
      }),
    );
  });
});

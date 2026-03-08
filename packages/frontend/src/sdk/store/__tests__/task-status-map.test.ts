import "../../provider/__tests__/setup";
import { describe, expect, test } from "bun:test";
import { createWebSocketStore } from "../createWebSocketStore";

describe("task status map synchronization", () => {
  test("registers running subTasks as streaming so they can be interrupted immediately", () => {
    const store = createWebSocketStore({
      url: "ws://localhost:10013",
      autoConnect: false,
    });

    store.getState().setTaskStatusMap("parent-task", {
      "Task 1": {
        subTaskId: "sub-task-1",
        status: "running",
      },
    });

    expect(store.getState().tasks["sub-task-1"]).toBeDefined();
    expect(store.getState().tasks["sub-task-1"]?.status).toBe("streaming");
  });

  test("maps subTask lifecycle states onto the frontend task state machine", () => {
    const store = createWebSocketStore({
      url: "ws://localhost:10013",
      autoConnect: false,
    });

    store.getState().registerTask("sub-task-1");

    store.getState().setTaskStatusMap("parent-task", {
      "Task 1": {
        subTaskId: "sub-task-1",
        status: "waiting_user_input",
      },
      "Task 2": {
        subTaskId: "sub-task-2",
        status: "wait_review",
      },
      "Task 3": {
        subTaskId: "sub-task-3",
        status: "failed",
      },
      "Task 4": {
        subTaskId: "sub-task-4",
        status: "completed",
      },
    });

    const { tasks } = store.getState();
    expect(tasks["sub-task-1"]?.status).toBe("idle");
    expect(tasks["sub-task-2"]?.status).toBe("waiting_tool_call");
    expect(tasks["sub-task-3"]?.status).toBe("error");
    expect(tasks["sub-task-4"]?.status).toBe("completed");
  });

  test("keeps an actively streaming subTask in streaming state after loading task history", () => {
    const store = createWebSocketStore({
      url: "ws://localhost:10013",
      autoConnect: false,
    });

    store.getState().processMessage({
      type: "taskHistory",
      data: {
        taskId: "sub-task-streaming",
        messages: [],
        conversationStatus: "streaming",
      },
    } as any);

    expect(store.getState().tasks["sub-task-streaming"]?.status).toBe("streaming");
  });
});

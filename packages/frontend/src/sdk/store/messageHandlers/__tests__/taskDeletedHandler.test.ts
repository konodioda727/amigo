import { describe, expect, test } from "bun:test";
import type { WebSocketMessage } from "@amigo-llm/types";
import { createWebSocketStore } from "../../createWebSocketStore";
import { handleTaskDeleted } from "../taskDeletedHandler";

describe("handleTaskDeleted", () => {
  test("clears the current conversation when the main task is deleted", () => {
    const store = createWebSocketStore({
      autoConnect: false,
      initialState: {
        mainTaskId: "task-main",
      },
    });

    store.getState().registerTask("task-main");
    store.getState().registerTask("task-child");
    store.getState().setActiveTask("task-child");
    store.getState().handleSessionHistories([
      { taskId: "task-main", title: "Main", updatedAt: "2026-03-16T00:00:00.000Z" },
      { taskId: "task-child", title: "Child", updatedAt: "2026-03-16T00:00:00.000Z" },
    ]);

    handleTaskDeleted(
      {
        type: "taskDeleted",
        data: {
          taskId: "task-main",
          deletedChildTaskIds: ["task-child"],
        },
      } as WebSocketMessage<"taskDeleted">,
      store.getState(),
    );

    const nextState = store.getState();

    expect(nextState.mainTaskId).toBe("");
    expect(nextState.activeTaskId).toBeNull();
    expect(nextState.tasks["task-main"]).toBeUndefined();
    expect(nextState.tasks["task-child"]).toBeUndefined();
    expect(nextState.taskHistories).toEqual([]);
  });
});

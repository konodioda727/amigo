import "../../provider/__tests__/setup";
import { describe, expect, test } from "bun:test";
import { createWebSocketStore } from "../createWebSocketStore";
import { handleTaskStatusMapUpdated } from "../messageHandlers/taskStatusMapUpdatedHandler";

describe("doc state reset on conversation changes", () => {
  test("clears previous docs immediately when switching conversations", () => {
    const store = createWebSocketStore({
      url: "ws://localhost:10013",
      autoConnect: false,
    });

    store.getState().setMainTaskId("task-a");
    store.getState().setDocContent("# Old design doc", "Design", "design");

    expect(store.getState().docState.isOpen).toBe(true);
    expect(store.getState().docState.documents.design.content).toBe("# Old design doc");

    store.getState().setMainTaskId("task-b");

    const { docState, mainTaskId, activeTaskId } = store.getState();
    expect(mainTaskId).toBe("task-b");
    expect(activeTaskId).toBe("task-b");
    expect(docState.isOpen).toBe(false);
    expect(docState.activeDoc).toBe("taskList");
    expect(docState.documents.requirements.content).toBeNull();
    expect(docState.documents.design.content).toBeNull();
    expect(docState.documents.taskList.content).toBeNull();
  });

  test("does not keep previous docs when creating a new conversation", () => {
    const store = createWebSocketStore({
      url: "ws://localhost:10013",
      autoConnect: false,
    });

    store.getState().setMainTaskId("task-a");
    store.getState().setDocContent("- [ ] stale task", "Task List", "taskList");

    store.getState().createNewConversation();

    const { docState, mainTaskId, activeTaskId } = store.getState();
    expect(mainTaskId).toBe("");
    expect(activeTaskId).toBeNull();
    expect(docState.isOpen).toBe(false);
    expect(docState.activeDoc).toBe("taskList");
    expect(docState.documents.requirements.content).toBeNull();
    expect(docState.documents.design.content).toBeNull();
    expect(docState.documents.taskList.content).toBeNull();
  });

  test("hydrates cached docs after a new conversation taskId arrives", () => {
    const store = createWebSocketStore({
      url: "ws://localhost:10013",
      autoConnect: false,
    });

    handleTaskStatusMapUpdated(
      {
        type: "taskStatusMapUpdated",
        data: {
          taskId: "task-race",
          subTasks: {},
          documents: {
            taskList: "- [ ] implement module drafts",
          },
        },
      } as any,
      store.getState() as any,
    );

    expect(store.getState().docState.documents.taskList.content).toBeNull();

    store.getState().setCurrentTaskIdsForNewConversation("task-race");

    const { docState } = store.getState();
    expect(docState.isOpen).toBe(true);
    expect(docState.activeDoc).toBe("taskList");
    expect(docState.documents.taskList.content).toBe("- [ ] implement module drafts");
  });
});

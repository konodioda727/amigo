/**
 * Property-Based Test for Task Management
 *
 * **Feature: frontend-sdk, Property 7: Task Management Integrity**
 * **Validates: Requirements 3.3**
 *
 * For any set of tasks, the task management system should correctly
 * register, track, and isolate task state.
 */

import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { createWebSocketStore } from "../createWebSocketStore";

// ============================================================================
// Test Generators (Arbitraries)
// ============================================================================

/**
 * Generate a unique task ID
 */
const taskIdArb = fc.uuid();

/**
 * Generate an array of unique task IDs
 */
const uniqueTaskIdsArb = (minLength: number, maxLength: number) =>
  fc
    .array(taskIdArb, { minLength, maxLength })
    .map((ids) => Array.from(new Set(ids)))
    .filter((ids) => ids.length >= minLength);

// ============================================================================
// Property Tests
// ============================================================================

describe("Property 7: Task Management Integrity", () => {
  /**
   * Property: All registered tasks are accessible
   *
   * For any set of registered tasks, all tasks should be accessible
   * through the tasks object.
   */
  test("All registered tasks are accessible", () => {
    fc.assert(
      fc.property(uniqueTaskIdsArb(1, 10), (taskIds) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        // Register all tasks
        for (const taskId of taskIds) {
          store.getState().registerTask(taskId);
        }

        // Verify all tasks are in the store
        const state = store.getState();
        for (const taskId of taskIds) {
          expect(state.tasks[taskId]).toBeDefined();
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Task registration is idempotent
   *
   * Registering the same task multiple times should not create duplicates
   * or change the task's properties.
   */
  test("Task registration is idempotent", () => {
    fc.assert(
      fc.property(taskIdArb, (taskId) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        // Register task multiple times
        store.getState().registerTask(taskId);
        store.getState().registerTask(taskId);
        store.getState().registerTask(taskId);

        // Should only have one task
        const state = store.getState();
        const taskCount = Object.keys(state.tasks).filter((id) => id === taskId).length;
        expect(taskCount).toBe(1);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Main task ID is set correctly
   *
   * The first registered task should become the main task.
   */
  test("Main task ID is set correctly", () => {
    fc.assert(
      fc.property(uniqueTaskIdsArb(1, 5), (taskIds) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        // Set the first task as main task
        store.getState().setMainTaskId(taskIds[0]);

        // Main task should be the first one
        const state = store.getState();
        expect(state.mainTaskId).toBe(taskIds[0]);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Active task ID can be switched
   *
   * Switching to any registered task should update activeTaskId.
   */
  test("Active task ID can be switched", () => {
    fc.assert(
      fc.property(
        uniqueTaskIdsArb(2, 5),
        fc.integer({ min: 0, max: 4 }),
        (taskIds, targetIndex) => {
          const store = createWebSocketStore({
            url: "ws://localhost:10013",
            autoConnect: false,
          });

          // Register all tasks
          for (const taskId of taskIds) {
            store.getState().registerTask(taskId);
          }

          // Switch to a specific task
          const targetTaskId = taskIds[targetIndex % taskIds.length];
          store.getState().setActiveTask(targetTaskId);

          // Verify active task
          const state = store.getState();
          expect(state.activeTaskId).toBe(targetTaskId);

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Task messages are isolated
   *
   * Messages added to one task should not appear in another task.
   */
  test("Task messages are isolated", () => {
    fc.assert(
      fc.property(taskIdArb, taskIdArb, (taskId1, taskId2) => {
        // Skip if task IDs are the same
        if (taskId1 === taskId2) return true;

        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        // Register both tasks
        store.getState().registerTask(taskId1);
        store.getState().registerTask(taskId2);

        // Add a message to task1
        const message = {
          type: "message" as const,
          data: {
            message: "Test message",
            updateTime: Date.now(),
          },
        };
        store.getState().addMessageToTask(taskId1, message as any);

        // Verify task2 doesn't have the message
        const state = store.getState();
        expect(state.tasks[taskId1].rawMessages.length).toBeGreaterThan(0);
        expect(state.tasks[taskId2].rawMessages.length).toBe(0);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Task state initialization
   *
   * Each registered task should have proper initial state.
   */
  test("Task state initialization", () => {
    fc.assert(
      fc.property(uniqueTaskIdsArb(1, 5), (taskIds) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        // Register all tasks
        for (const taskId of taskIds) {
          store.getState().registerTask(taskId);
        }

        // Verify each task has proper initial state
        const state = store.getState();
        for (const taskId of taskIds) {
          const task = state.tasks[taskId];
          expect(task.rawMessages).toEqual([]);
          expect(task.displayMessages).toEqual([]);
          expect(task.isLoading).toBe(false);
          expect(task.lastUpdateTime).toBeGreaterThan(0);
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Task unregistration removes task
   *
   * Unregistering a task should remove it from the store.
   */
  test("Task unregistration removes task", () => {
    fc.assert(
      fc.property(uniqueTaskIdsArb(2, 5), (taskIds) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        // Register all tasks
        for (const taskId of taskIds) {
          store.getState().registerTask(taskId);
        }

        // Unregister the first task
        const taskToRemove = taskIds[0];
        store.getState().unregisterTask(taskToRemove);

        // Verify task is removed
        const state = store.getState();
        expect(state.tasks[taskToRemove]).toBeUndefined();

        // Verify other tasks still exist
        for (let i = 1; i < taskIds.length; i++) {
          expect(state.tasks[taskIds[i]]).toBeDefined();
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Task loading state can be toggled
   *
   * Setting loading state should update the task's isLoading property.
   */
  test("Task loading state can be toggled", () => {
    fc.assert(
      fc.property(taskIdArb, fc.boolean(), (taskId, isLoading) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        // Register task
        store.getState().registerTask(taskId);

        // Set loading state
        store.getState().setLoading(taskId, isLoading);

        // Verify loading state
        const state = store.getState();
        expect(state.tasks[taskId].isLoading).toBe(isLoading);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Clearing messages empties task messages
   *
   * Clearing messages should remove all messages from a task.
   */
  test("Clearing messages empties task messages", () => {
    fc.assert(
      fc.property(taskIdArb, (taskId) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        // Register task
        store.getState().registerTask(taskId);

        // Add a message
        const message = {
          type: "message" as const,
          data: {
            message: "Test message",
            updateTime: Date.now(),
          },
        };
        store.getState().addMessageToTask(taskId, message as any);

        // Verify message was added
        expect(store.getState().tasks[taskId].rawMessages.length).toBeGreaterThan(0);

        // Clear messages
        store.getState().clearMessages(taskId);

        // Verify messages are cleared
        const state = store.getState();
        expect(state.tasks[taskId].rawMessages).toEqual([]);
        expect(state.tasks[taskId].displayMessages).toEqual([]);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Task count matches registered tasks
   *
   * The number of tasks in the store should match the number of registered tasks.
   */
  test("Task count matches registered tasks", () => {
    fc.assert(
      fc.property(uniqueTaskIdsArb(1, 10), (taskIds) => {
        const store = createWebSocketStore({
          url: "ws://localhost:10013",
          autoConnect: false,
        });

        // Register all tasks
        for (const taskId of taskIds) {
          store.getState().registerTask(taskId);
        }

        // Verify task count
        const state = store.getState();
        const taskCount = Object.keys(state.tasks).length;
        expect(taskCount).toBe(taskIds.length);

        return true;
      }),
      { numRuns: 100 },
    );
  });
});

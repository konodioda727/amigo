import { useCallback } from "react";
import { useWebSocketContext } from "../context/WebSocketContext";
import type { UseTasksReturn } from "../types/hooks";
import type { TaskHierarchy, TaskStatus } from "../types/store";

/**
 * Hook to access task state and operations.
 * Provides task data, current task ID, main task ID, and task operations.
 *
 * @returns Task state and operations
 * @throws {Error} If used outside of WebSocketProvider
 *
 * @example
 * ```tsx
 * function TaskList() {
 *   const { tasks, currentTaskId, mainTaskId, switchTask, getTaskStatus } = useTasks();
 *
 *   return (
 *     <div>
 *       <h3>Main Task: {mainTaskId}</h3>
 *       <h4>Current Task: {currentTaskId}</h4>
 *       {Object.keys(tasks).map(taskId => (
 *         <div key={taskId}>
 *           <button onClick={() => switchTask(taskId)}>
 *             Task {taskId} - {getTaskStatus(taskId)}
 *           </button>
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useTasks(): UseTasksReturn {
  const context = useWebSocketContext();
  const { store } = context;

  // Get task state using Zustand selectors
  const tasks = store((state) => state.tasks);
  const currentTaskId = store((state) => state.activeTaskId);
  const mainTaskId = store((state) => state.mainTaskId);

  // Task operations
  const switchTask = useCallback(
    (taskId: string) => {
      store.getState().setActiveTask(taskId);
    },
    [store],
  );

  const getTaskHierarchy = useCallback(
    (taskId: string): TaskHierarchy => {
      const children: TaskHierarchy[] = [];

      return {
        taskId,
        children,
      };
    },
    [store],
  );

  const getTaskStatus = useCallback(
    (taskId: string): TaskStatus => {
      const state = store.getState();
      const task = state.tasks[taskId];

      if (!task) {
        return "error";
      }

      // Return the task's status directly from state machine
      return task.status;
    },
    [store],
  );

  return {
    tasks,
    currentTaskId,
    mainTaskId,
    switchTask,
    getTaskHierarchy,
    getTaskStatus,
  };
}

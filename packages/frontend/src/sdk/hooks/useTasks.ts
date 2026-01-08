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
      // Build task hierarchy by analyzing messages
      const state = store.getState();
      const allTasks = state.tasks;

      // Find children by looking for assignTaskUpdated messages
      const children: TaskHierarchy[] = [];

      Object.keys(allTasks).forEach((childTaskId) => {
        const childTask = allTasks[childTaskId];
        const rawMessages = childTask?.rawMessages || [];

        // Check if this task was created by the parent task
        for (const msg of rawMessages) {
          if (msg.type === "assignTaskUpdated") {
            const data = msg.data as any;
            if (data.parentTaskId === taskId) {
              children.push(getTaskHierarchy(childTaskId));
              break;
            }
          }
        }
      });

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

      // Determine status based on messages
      const displayMessages = task.displayMessages || [];
      const lastMessage = displayMessages[displayMessages.length - 1];

      if (task.isLoading) {
        return "active";
      }

      if (lastMessage?.type === "completionResult") {
        return "completed";
      }

      if (lastMessage?.type === "interrupt") {
        return "interrupted";
      }

      if (lastMessage?.type === "error") {
        return "error";
      }

      return "active";
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

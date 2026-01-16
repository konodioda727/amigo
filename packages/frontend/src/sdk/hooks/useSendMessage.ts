import { useCallback } from "react";
import { useWebSocketContext } from "../context/WebSocketContext";
import type { UseSendMessageReturn } from "../types/hooks";

/**
 * Hook to send messages to the WebSocket server.
 * Provides functions to send user messages, interrupts, resume, and load task commands.
 *
 * @returns Message sending functions
 * @throws {Error} If used outside of WebSocketProvider
 *
 * @example
 * ```tsx
 * function MessageControls() {
 *   const { sendMessage, sendInterrupt, sendResume, sendLoadTask } = useSendMessage();
 *
 *   return (
 *     <div>
 *       <button onClick={() => sendMessage('Hello!')}>Send Message</button>
 *       <button onClick={() => sendInterrupt()}>Interrupt</button>
 *       <button onClick={() => sendResume()}>Resume</button>
 *       <button onClick={() => sendLoadTask('task-123')}>Load Task</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useSendMessage(): UseSendMessageReturn {
  const context = useWebSocketContext();
  const { store } = context;

  /**
   * Send a user message to the specified task.
   * If no taskId is provided, uses the current main task.
   */
  const sendMessage = useCallback(
    (message: string, taskId?: string) => {
      const state = store.getState();
      let effectiveTaskId = taskId || state.mainTaskId;

      // If no task ID exists (new conversation), let server create one
      // We'll use a temporary placeholder that server will replace
      if (!effectiveTaskId || effectiveTaskId.trim() === "") {
        effectiveTaskId = ""; // Server will handle empty taskId as new conversation
      }

      state.sendMessage(effectiveTaskId, {
        type: "userSendMessage",
        data: {
          message,
          taskId: effectiveTaskId,
        },
      });
    },
    [store],
  );

  /**
   * Send an interrupt command to the specified task.
   * If no taskId is provided, uses the current main task.
   */
  const sendInterrupt = useCallback(
    (taskId?: string) => {
      const state = store.getState();
      const effectiveTaskId = taskId || state.mainTaskId;

      if (!effectiveTaskId || effectiveTaskId.trim() === "") {
        console.warn("[useSendMessage] Cannot send interrupt: no task ID available");
        return;
      }

      state.sendMessage(effectiveTaskId, {
        type: "interrupt",
        data: {
          taskId: effectiveTaskId,
          updateTime: Date.now(),
        },
      });
    },
    [store],
  );

  /**
   * Send a resume command to the specified task.
   * If no taskId is provided, uses the current main task.
   */
  const sendResume = useCallback(
    (taskId?: string) => {
      const state = store.getState();
      const effectiveTaskId = taskId || state.mainTaskId;

      if (!effectiveTaskId || effectiveTaskId.trim() === "") {
        console.warn("[useSendMessage] Cannot send resume: no task ID available");
        return;
      }

      state.sendMessage(effectiveTaskId, {
        type: "resume",
        data: {
          taskId: effectiveTaskId,
        },
      });
    },
    [store],
  );

  /**
   * Send a load task command to load a specific task's history.
   */
  const sendLoadTask = useCallback(
    (taskId: string) => {
      const state = store.getState();

      state.sendMessage(taskId, {
        type: "loadTask",
        data: {
          taskId,
        },
      });
    },
    [store],
  );

  return {
    sendMessage,
    sendInterrupt,
    sendResume,
    sendLoadTask,
  };
}

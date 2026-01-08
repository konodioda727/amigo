import { useCallback, useMemo } from "react";
import { useWebSocketContext } from "../context/WebSocketContext";
import type { UseMessagesReturn } from "../types/hooks";

/**
 * Hook to access messages for a specific task.
 * Provides messages, raw messages, and message operations.
 * Defaults to the current task if no taskId is provided.
 *
 * @param taskId - Optional task ID. Defaults to currentTaskId if not provided.
 * @returns Messages and message operations for the specified task
 * @throws {Error} If used outside of WebSocketProvider
 *
 * @example
 * ```tsx
 * function ChatMessages({ taskId }: { taskId?: string }) {
 *   const { messages, sendMessage, clearMessages } = useMessages(taskId);
 *
 *   return (
 *     <div>
 *       {messages.map((msg, idx) => (
 *         <div key={idx}>{JSON.stringify(msg)}</div>
 *       ))}
 *       <button onClick={() => sendMessage('Hello!')}>Send</button>
 *       <button onClick={clearMessages}>Clear</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useMessages(taskId?: string): UseMessagesReturn {
  const context = useWebSocketContext();
  const { store } = context;

  // Get the effective task ID (provided or current)
  const currentTaskId = store((state) => state.mainTaskId);
  const effectiveTaskId = taskId || currentTaskId;

  // Get task state using Zustand selector
  const taskState = store((state) => state.tasks[effectiveTaskId]);

  // Extract messages from task state
  const messages = useMemo(() => {
    return taskState?.displayMessages || [];
  }, [taskState?.displayMessages]);

  const rawMessages = useMemo(() => {
    return taskState?.rawMessages || [];
  }, [taskState?.rawMessages]);

  // Message operations
  const sendMessage = useCallback(
    (message: string) => {
      if (!effectiveTaskId) {
        console.warn("[useMessages] Cannot send message: no task ID available");
        return;
      }

      store.getState().sendMessage(effectiveTaskId, {
        type: "userSendMessage",
        data: {
          message,
          taskId: effectiveTaskId,
        },
      });
    },
    [store, effectiveTaskId],
  );

  const clearMessages = useCallback(() => {
    if (!effectiveTaskId) {
      console.warn("[useMessages] Cannot clear messages: no task ID available");
      return;
    }

    store.getState().clearMessages(effectiveTaskId);
  }, [store, effectiveTaskId]);

  return {
    messages,
    rawMessages,
    sendMessage,
    clearMessages,
  };
}

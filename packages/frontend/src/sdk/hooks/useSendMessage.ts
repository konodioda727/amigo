import type {
  USER_SEND_MESSAGE_NAME,
  UserMessageAttachment,
  UserSendMessageData,
  WebSocketMessage,
} from "@amigo-llm/types";
import { useCallback } from "react";
import { useWebSocketContext } from "../context/WebSocketContext";
import type { UseSendMessageReturn } from "../types/hooks";

const getConfirmOptimisticStatus = (toolName?: string): "idle" | "streaming" =>
  toolName === "completeTask" || toolName === "completionResult" ? "idle" : "streaming";

/**
 * Hook to send messages to the WebSocket server.
 * Provides functions to send user messages, interrupts, resume, load task, and create task commands.
 *
 * @returns Message sending functions
 * @throws {Error} If used outside of WebSocketProvider
 *
 * @example
 * ```tsx
 * function MessageControls() {
 *   const { sendMessage, sendInterrupt, sendResume, sendLoadTask, sendCreateTask } = useSendMessage();
 *
 *   return (
 *     <div>
 *       <button onClick={() => sendMessage('Hello!')}>Send Message</button>
 *       <button onClick={() => sendInterrupt()}>Interrupt</button>
 *       <button onClick={() => sendResume()}>Resume</button>
 *       <button onClick={() => sendLoadTask('task-123')}>Load Task</button>
 *       <button onClick={() => sendCreateTask('New task')}>Create Task</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useSendMessage(): UseSendMessageReturn {
  const context = useWebSocketContext();
  const { store } = context;
  const resolveTaskId = useCallback(
    (taskId?: string) => {
      const state = store.getState();
      return taskId || state.activeTaskId || state.mainTaskId;
    },
    [store],
  );
  const sendWsMessage = useCallback(
    <T extends USER_SEND_MESSAGE_NAME>(taskId: string, message: WebSocketMessage<T>) => {
      store.getState().sendMessage(taskId, message);
    },
    [store],
  );
  const resolveRequiredTaskId = useCallback(
    (taskId: string | undefined, warning: string): string | null => {
      const effectiveTaskId = resolveTaskId(taskId);
      if (!effectiveTaskId || effectiveTaskId.trim() === "") {
        console.warn(warning);
        return null;
      }
      return effectiveTaskId;
    },
    [resolveTaskId],
  );

  /**
   * Send a user message to the specified task.
   * If no taskId is provided, uses the current main task.
   */
  const sendMessage = useCallback(
    (
      message: string,
      taskId?: string,
      attachments?: UserMessageAttachment[],
      modelConfigSnapshot?: UserSendMessageData<"userSendMessage">["modelConfigSnapshot"],
    ) => {
      let effectiveTaskId = resolveTaskId(taskId);

      // If no task ID exists (new conversation), let server create one
      // We'll use a temporary placeholder that server will replace
      if (!effectiveTaskId || effectiveTaskId.trim() === "") {
        effectiveTaskId = ""; // Server will handle empty taskId as new conversation
      }

      sendWsMessage(effectiveTaskId, {
        type: "userSendMessage",
        data: {
          message,
          taskId: effectiveTaskId,
          attachments,
          modelConfigSnapshot,
        },
      });
    },
    [resolveTaskId, sendWsMessage],
  );

  /**
   * Send a create task command to create a new conversation.
   */
  const sendCreateTask = useCallback(
    (
      message: string,
      attachments?: UserMessageAttachment[],
      context?: unknown,
      modelConfigSnapshot?: UserSendMessageData<"createTask">["modelConfigSnapshot"],
    ) => {
      sendWsMessage("", {
        type: "createTask",
        data: {
          message,
          attachments,
          context,
          modelConfigSnapshot,
        },
      });
    },
    [sendWsMessage],
  );

  /**
   * Send an interrupt command to the specified task.
   * If no taskId is provided, uses the current main task.
   */
  const sendInterrupt = useCallback(
    (taskId?: string) => {
      const effectiveTaskId = resolveRequiredTaskId(
        taskId,
        "[useSendMessage] Cannot send interrupt: no task ID available",
      );
      if (!effectiveTaskId) {
        return;
      }

      sendWsMessage(effectiveTaskId, {
        type: "interrupt",
        data: {
          taskId: effectiveTaskId,
          updateTime: Date.now(),
        },
      });
    },
    [resolveRequiredTaskId, sendWsMessage],
  );

  /**
   * Send a resume command to the specified task.
   * If no taskId is provided, uses the current main task.
   */
  const sendResume = useCallback(
    (taskId?: string) => {
      const effectiveTaskId = resolveRequiredTaskId(
        taskId,
        "[useSendMessage] Cannot send resume: no task ID available",
      );
      if (!effectiveTaskId) {
        return;
      }

      sendWsMessage(effectiveTaskId, {
        type: "resume",
        data: {
          taskId: effectiveTaskId,
        },
      });
    },
    [resolveRequiredTaskId, sendWsMessage],
  );

  /**
   * Send a load task command to load a specific task's history.
   */
  const sendLoadTask = useCallback(
    (taskId: string) => {
      sendWsMessage(taskId, {
        type: "loadTask",
        data: {
          taskId,
        },
      });
    },
    [sendWsMessage],
  );

  const sendConfirm = useCallback(
    (taskId: string) => {
      const state = store.getState();
      const pendingToolName = state.tasks[taskId]?.pendingToolCall?.toolName;

      sendWsMessage(taskId, {
        type: "confirm",
        data: {
          taskId,
        },
      });

      state.setTaskStatus(taskId, getConfirmOptimisticStatus(pendingToolName));
      state.setPendingToolCall(taskId, undefined);
    },
    [sendWsMessage, store],
  );

  const sendReject = useCallback(
    (taskId: string) => {
      const state = store.getState();

      sendWsMessage(taskId, {
        type: "reject",
        data: {
          taskId,
        },
      });

      state.setTaskStatus(taskId, "idle");
      state.setPendingToolCall(taskId, undefined);
    },
    [sendWsMessage, store],
  );

  /**
   * Send a delete task command to delete a specific task.
   */
  const sendDeleteTask = useCallback(
    (taskId: string) => {
      if (!taskId || taskId.trim() === "") {
        console.warn("[useSendMessage] Cannot send deleteTask: no task ID provided");
        return;
      }

      sendWsMessage(taskId, {
        type: "deleteTask",
        data: {
          taskId,
        },
      });
    },
    [sendWsMessage],
  );

  const sendUpdateAutoApproveTools = useCallback(
    (toolNames: string[], taskId?: string) => {
      const effectiveTaskId = resolveRequiredTaskId(
        taskId,
        "[useSendMessage] Cannot send updateAutoApproveTools: no task ID available",
      );
      if (!effectiveTaskId) {
        return;
      }

      sendWsMessage(effectiveTaskId, {
        type: "updateAutoApproveTools",
        data: {
          taskId: effectiveTaskId,
          toolNames,
        },
      });
    },
    [resolveRequiredTaskId, sendWsMessage],
  );

  return {
    sendMessage,
    sendCreateTask,
    sendInterrupt,
    sendResume,
    sendLoadTask,
    sendConfirm,
    sendReject,
    sendDeleteTask,
    sendUpdateAutoApproveTools,
  };
}

export { getConfirmOptimisticStatus };

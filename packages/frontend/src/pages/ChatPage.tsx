import type React from "react";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChatWindow, MessageInput, useConnection } from "@/sdk";
import { useWebSocketContext } from "@/sdk/context/WebSocketContext";

/**
 * Chat page component that displays a conversation by taskId
 * Handles loading task history when taskId is present in URL
 */
const ChatPage: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const { store } = useWebSocketContext();
  const { isConnected } = useConnection();
  const navigate = useNavigate();

  // Load task history when taskId changes or connection is established
  useEffect(() => {
    if (taskId && isConnected) {
      // setMainTaskId will automatically send loadTask if socket is ready
      store.getState().setMainTaskId(taskId);
    }
  }, [taskId, isConnected, store]);

  // Monitor if current task is deleted, redirect to home
  useEffect(() => {
    if (!taskId) return;

    const unsubscribe = store.subscribe((state, prevState) => {
      // Check if the current task was deleted
      const taskExistedBefore = prevState.tasks[taskId] !== undefined;
      const taskExistsNow = state.tasks[taskId] !== undefined;

      if (taskExistedBefore && !taskExistsNow) {
        console.log(`[ChatPage] Task ${taskId} was deleted, redirecting to home`);
        navigate("/", { replace: true });
      }
    });

    return unsubscribe;
  }, [taskId, store, navigate]);

  // Monitor for task not found errors, redirect to home
  useEffect(() => {
    if (!taskId) return;

    const unsubscribe = store.subscribe((state) => {
      const task = state.tasks[taskId];
      if (!task) return;

      // Check for error messages indicating task not found
      const hasTaskNotFoundError = task.rawMessages.some(
        (msg) =>
          msg.type === "error" &&
          msg.data &&
          typeof msg.data === "object" &&
          "code" in msg.data &&
          msg.data.code === "TASK_NOT_FOUND",
      );

      if (hasTaskNotFoundError) {
        console.log(`[ChatPage] Task ${taskId} not found, redirecting to home`);
        navigate("/", { replace: true });
      }
    });

    return unsubscribe;
  }, [taskId, store, navigate]);

  return (
    <>
      <ChatWindow taskId={taskId} />
      <MessageInput taskId={taskId} />
    </>
  );
};

export default ChatPage;

import { ChatWindow, useConnection, useTasks, useWebSocketContext } from "@amigo-llm/frontend";
import type React from "react";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppMessageComposer } from "@/components/AppMessageComposer";

const hasTaskNotFoundError = (task: {
  rawMessages: Array<{
    type: string;
    data?: unknown;
  }>;
}): boolean => {
  return task.rawMessages.some(
    (msg) =>
      msg.type === "error" &&
      msg.data &&
      typeof msg.data === "object" &&
      "code" in msg.data &&
      msg.data.code === "TASK_NOT_FOUND",
  );
};

/**
 * Chat page component that displays a conversation by taskId
 * Handles loading task history when taskId is present in URL
 */
const ChatPage: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const { store } = useWebSocketContext();
  const { isConnected } = useConnection();
  const { currentTaskId } = useTasks();
  const navigate = useNavigate();
  const effectiveTaskId = currentTaskId || taskId;

  // Load task history when taskId changes or connection is established
  useEffect(() => {
    if (taskId && isConnected) {
      // setMainTaskId will automatically send loadTask if socket is ready
      store.getState().setMainTaskId(taskId);
    }
  }, [taskId, isConnected, store]);

  // Redirect if the route task disappears or was rejected by the server.
  useEffect(() => {
    if (!taskId) return;

    const unsubscribe = store.subscribe((state, prevState) => {
      const taskExistedBefore = prevState.tasks[taskId] !== undefined;
      const taskExistsNow = state.tasks[taskId] !== undefined;
      const task = state.tasks[taskId];

      if ((taskExistedBefore && !taskExistsNow) || (task && hasTaskNotFoundError(task))) {
        navigate("/", { replace: true });
      }
    });

    return unsubscribe;
  }, [taskId, store, navigate]);

  return (
    <div className="flex-1 w-full flex flex-col overflow-hidden">
      <ChatWindow taskId={effectiveTaskId} />
      <AppMessageComposer taskId={effectiveTaskId} />
    </div>
  );
};

export default ChatPage;

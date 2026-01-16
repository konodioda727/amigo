import type React from "react";
import { useEffect } from "react";
import { useParams } from "react-router-dom";
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

  // Load task history when taskId changes or connection is established
  useEffect(() => {
    if (taskId && isConnected) {
      // setMainTaskId will automatically send loadTask if socket is ready
      store.getState().setMainTaskId(taskId);
    }
  }, [taskId, isConnected, store]);

  return (
    <>
      <ChatWindow taskId={taskId} />
      <MessageInput taskId={taskId} />
    </>
  );
};

export default ChatPage;

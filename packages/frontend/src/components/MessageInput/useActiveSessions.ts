import { useWebSocket } from "../WebSocketProvider";
import type { SessionInfo } from "./MentionList";

export const useActiveSessions = () => {
  const { displayMessages, taskId } = useWebSocket();

  const getActiveSessions = (): SessionInfo[] => {
    const sessions: SessionInfo[] = [
      { id: taskId || "", type: "main", title: "主会话", isActive: true },
    ];

    displayMessages.forEach((msg) => {
      if (msg.type === "tool") {
        const toolMsg = msg as {
          toolName?: string;
          params?: { tasklist?: Array<{ taskId?: string; target?: string }> };
        };
        if (toolMsg.toolName === "assignTasks") {
          const tasklist = toolMsg.params?.tasklist || [];

          tasklist.forEach((task, idx: number) => {
            if (task.taskId) {
              sessions.push({
                id: task.taskId,
                type: "subtask",
                title: task.target || `子任务 #${idx + 1}`,
                isActive: true,
              });
            }
          });
        }
      }
    });

    return sessions;
  };

  return { getActiveSessions };
};

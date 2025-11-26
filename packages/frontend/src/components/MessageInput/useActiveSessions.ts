import { useRef, useEffect } from "react";
import { useWebSocket } from "../WebSocketProvider";
import type { SessionInfo } from "./MentionList";

export const useActiveSessions = () => {
  const { displayMessages, taskId } = useWebSocket();
  
  // 使用 ref 保存最新的函数实现
  const getActiveSessionsRef = useRef<() => SessionInfo[]>(() => []);

  // 每次 displayMessages 或 taskId 变化时更新 ref
  useEffect(() => {
    getActiveSessionsRef.current = (): SessionInfo[] => {
      const sessions: SessionInfo[] = [
        { id: taskId || "", type: "main", title: "主会话", isActive: true },
      ];

      // 获取最后一条消息
      const lastMessage = displayMessages[displayMessages.length - 1];
      
      // 只有当最后一条消息是 assignTasks 工具调用时，才显示子任务
      if (lastMessage?.type === "tool") {
        const toolMsg = lastMessage as {
          type: "tool";
          toolName: string;
          params: Record<string, unknown>;
          toolOutput?: unknown;
          updateTime: number;
        };
        
        if (toolMsg.toolName === "assignTasks") {
          const params = toolMsg.params as { 
            tasklist?: Array<{ taskId?: string; target?: string; completed?: boolean }> 
          };
          const tasklist = params.tasklist || [];

          // 检查是否有未完成的子任务
          const hasIncompleteSubtasks = tasklist.some(task => !task.completed);

          if (hasIncompleteSubtasks) {
            tasklist.forEach((task, idx: number) => {
              if (task.taskId) {
                sessions.push({
                  id: task.taskId,
                  type: "subtask",
                  title: task.target || `子任务 #${idx + 1}`,
                  isActive: !task.completed,
                });
              }
            });
          }
        }
      }

      return sessions;
    };
  }, [displayMessages, taskId]);

  // 返回一个稳定的函数引用，内部调用最新的实现
  const getActiveSessions = () => getActiveSessionsRef.current();

  return { getActiveSessions };
};

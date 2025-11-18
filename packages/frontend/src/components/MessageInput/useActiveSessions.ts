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

      console.log("[useActiveSessions] displayMessages:", displayMessages);

      displayMessages.forEach((msg) => {
        if (msg.type === "tool") {
          // Type guard to check if it's a tool message
          const toolMsg = msg as { 
            type: "tool";
            toolName: string;
            params: Record<string, unknown>;
            updateTime: number;
          };
          
          console.log("[useActiveSessions] Found tool message:", toolMsg.toolName, toolMsg.params);
          
          if (toolMsg.toolName === "assignTasks") {
            const params = toolMsg.params as { 
              tasklist?: Array<{ taskId?: string; target?: string }> 
            };
            const tasklist = params.tasklist || [];

            console.log("[useActiveSessions] assignTasks tasklist:", tasklist);

            tasklist.forEach((task, idx: number) => {
              if (task.taskId) {
                console.log("[useActiveSessions] Adding subtask:", task.taskId, task.target);
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

      console.log("[useActiveSessions] Final sessions:", sessions);
      return sessions;
    };
  }, [displayMessages, taskId]);

  // 返回一个稳定的函数引用，内部调用最新的实现
  const getActiveSessions = () => getActiveSessionsRef.current();

  return { getActiveSessions };
};

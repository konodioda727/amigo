import { useRef, useEffect } from "react";
import { useWebSocketStore } from "@/store/websocket";
import type { SessionInfo } from "../MentionList";

export const useActiveSessions = () => {
  const mainTaskId = useWebSocketStore((state) => state.mainTaskId);
  const taskState = useWebSocketStore((state) => state.tasks[mainTaskId]);
  const tasks = useWebSocketStore((state) => state.tasks);
  const displayMessages = taskState?.displayMessages || [];
  
  const getActiveSessionsRef = useRef<() => SessionInfo[]>(() => []);

  useEffect(() => {
    getActiveSessionsRef.current = (): SessionInfo[] => {
      const sessions: SessionInfo[] = [
        { id: mainTaskId || "", type: "main", title: "主会话", isActive: true },
      ];

      // 遍历所有消息，查找所有的 assignTasks
      for (const msg of displayMessages) {
        if (msg.type === "tool") {
          const toolMsg = msg as {
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

            tasklist.forEach((task, idx: number) => {
              if (task.taskId) {
                // 检查子任务的状态
                const subTaskState = tasks[task.taskId];
                const subTaskMessages = subTaskState?.displayMessages || [];
                const lastSubTaskMessage = subTaskMessages[subTaskMessages.length - 1];
                
                // 如果子任务有 askFollowupQuestion，标记为活跃
                const hasFollowupQuestion = lastSubTaskMessage?.type === "askFollowupQuestion";
                const isActive = !task.completed || hasFollowupQuestion;
                
                // 只添加活跃的子任务
                if (isActive) {
                  // 检查是否已经添加过这个子任务
                  const existingSession = sessions.find(s => s.id === task.taskId);
                  if (!existingSession) {
                    sessions.push({
                      id: task.taskId,
                      type: "subtask",
                      title: task.target || `子任务 #${idx + 1}`,
                      isActive: true,
                    });
                  }
                }
              }
            });
          }
        }
      }

      return sessions;
    };
  }, [displayMessages, mainTaskId, tasks]);

  const getActiveSessions = () => getActiveSessionsRef.current();

  return { getActiveSessions };
};

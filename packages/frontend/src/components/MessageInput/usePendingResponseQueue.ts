import { useRef, useCallback, useEffect } from "react";
import { useWebSocket } from "../WebSocketProvider";
import type { DisplayMessageType } from "@/messages/types";

interface PendingResponse {
  sessionId: string;
  sessionTitle: string;
  type: "main" | "subtask";
}

interface UsePendingResponseQueueProps {
  onFocusSession: (sessionId: string, sessionTitle: string) => void;
}

export const usePendingResponseQueue = ({ onFocusSession }: UsePendingResponseQueueProps) => {
  const { displayMessages, taskId } = useWebSocket();
  const queueRef = useRef<PendingResponse[]>([]);
  const currentFocusRef = useRef<string | null>(null);
  const processedMessagesRef = useRef<Set<number>>(new Set());

  // 处理队列中的下一个会话
  const processNextInQueue = useCallback(() => {
    if (queueRef.current.length === 0) {
      currentFocusRef.current = null;
      return;
    }

    const next = queueRef.current.shift();
    if (next) {
      currentFocusRef.current = next.sessionId;
      onFocusSession(next.sessionId, next.sessionTitle);
    }
  }, [onFocusSession]);

  // 添加到队列
  const addToQueue = useCallback((item: PendingResponse) => {
    // 避免重复添加
    const exists = queueRef.current.some(q => q.sessionId === item.sessionId);
    if (exists) return;

    // 如果当前没有正在处理的会话，直接处理
    if (!currentFocusRef.current) {
      currentFocusRef.current = item.sessionId;
      onFocusSession(item.sessionId, item.sessionTitle);
    } else {
      // 否则加入队列
      queueRef.current.push(item);
    }
  }, [onFocusSession]);

  // 标记当前会话已处理完成
  const markCurrentComplete = useCallback(() => {
    currentFocusRef.current = null;
    processNextInQueue();
  }, [processNextInQueue]);

  // 监听消息变化，检测 askFollowupQuestion
  useEffect(() => {
    // 检查主会话的最后一条消息
    const lastMessage = displayMessages[displayMessages.length - 1];
    
    if (lastMessage?.type === "askFollowupQuestion" && lastMessage.updateTime) {
      // 避免重复处理同一条消息
      if (!processedMessagesRef.current.has(lastMessage.updateTime)) {
        processedMessagesRef.current.add(lastMessage.updateTime);
        addToQueue({
          sessionId: taskId || "",
          sessionTitle: "主会话",
          type: "main",
        });
      }
    }

    // 检查子任务的 askFollowupQuestion（通过 assignTasks 的子任务状态）
    // 这部分需要通过 SubTaskRenderer 的消息来检测
    // 暂时只处理主会话的情况
  }, [displayMessages, taskId, addToQueue]);

  return {
    addToQueue,
    markCurrentComplete,
    currentFocus: currentFocusRef.current,
  };
};

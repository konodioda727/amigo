import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import type {
  WebSocketMessage,
  SERVER_SEND_MESSAGE_NAME,
  ServerSendMessageData,
  USER_SEND_MESSAGE_NAME,
} from "@amigo/types";
import _ from "lodash";
import { useMessages } from "../messages";
import { DisplayMessageType } from "@/messages/types";

type Unsubscribe = () => void;
type Listener<T extends SERVER_SEND_MESSAGE_NAME> = (data: ServerSendMessageData<T>) => void;

interface WebSocketContextType {
  socket: WebSocket | null;
  taskId: string;
  setTaskId: React.Dispatch<React.SetStateAction<string>>;
  taskHistories: Array<{ taskId: string; title: string }>;
  displayMessages: DisplayMessageType[];
  sendMessage: <T extends USER_SEND_MESSAGE_NAME>(newMessage: WebSocketMessage<T>) => void;
  subscribe: <T extends SERVER_SEND_MESSAGE_NAME>(type: T, listener: Listener<T>) => Unsubscribe;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
};

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [taskId, setTaskId] = useState<string>('');
  const [taskHistories, setTaskHistories] = useState<Array<{ taskId: string; title: string }>>([]);
  const { processReceivedMessage, updateMessage, combinedMessages: displayMessages } = useMessages();
  const listenersRef = useRef<Record<SERVER_SEND_MESSAGE_NAME, Listener<any>[]>>({} as any);

  const subscribe = useCallback(<T extends SERVER_SEND_MESSAGE_NAME>(type: T, listener: Listener<T>): Unsubscribe => {
    const listeners = (listenersRef.current[type] || []) as Listener<T>[];
    listeners.push(listener);
    listenersRef.current[type] = listeners;

    return () => {
      const newListeners = (listenersRef.current[type] || []).filter(l => l !== listener);
      listenersRef.current[type] = newListeners;
    };
  }, []);

  const connectWebSocket = useCallback(() => {
    const ws = new WebSocket("ws://localhost:10013");

    ws.onopen = () => {
      console.log("WebSocket connection established.");
      setSocket(ws);
    };

    ws.onmessage = (event) => {
      try {
        const newMessage = JSON.parse(event.data) as WebSocketMessage<SERVER_SEND_MESSAGE_NAME>;
        
        // 监听 sessionHistories 消息，更新会话历史列表
        if (newMessage.type === 'sessionHistories') {
          const data = newMessage.data as any;
          setTaskHistories(data.sessionHistories || []);
        }
        
        // 监听 ack 消息，自动更新 taskId
        if (newMessage.type === 'ack') {
          const ackData = newMessage.data as any;
          if (ackData.taskId && ackData.taskId !== taskId) {
            console.log(`[WebSocketProvider] Auto-updating taskId from ack: ${ackData.taskId}`);
            setTaskId(ackData.taskId);
          }
        }
        
        // 先处理全局消息
        processReceivedMessage(newMessage);
        
        // 然后通知订阅者
        const messageType = newMessage.type as SERVER_SEND_MESSAGE_NAME;
        const listeners = listenersRef.current[messageType];
        if (listeners && listeners.length > 0) {
          listeners.forEach(listener => {
            listener(newMessage.data);
          });
        }
      } catch (error) {
        console.error("Failed to parse message data:", error);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket connection closed.");
      setSocket(null);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return ws;
  }, [processReceivedMessage]);

  const sendMessage = useCallback(<T extends USER_SEND_MESSAGE_NAME>(newMessage: WebSocketMessage<T>) => {
    // 如果有 taskId，自动注入到 userSendMessage 中
    const messageToSend = taskId && newMessage.type === "userSendMessage" 
      ? {
          ...newMessage,
          data: {
            ...newMessage.data,
            taskId, // 自动使用当前 Provider 的 taskId
          }
        }
      : newMessage;

    // 只有 userSendMessage 需要添加到消息列表中
    // interrupt、resume、loadTask 等控制消息不需要显示
    if (messageToSend.type === "userSendMessage") {
      updateMessage({ ...messageToSend, data: { ...messageToSend.data, status: "pending" } });
    }
    socket?.send(JSON.stringify(messageToSend));
  }, [socket, taskId, updateMessage]);

  useEffect(() => {
    const ws = connectWebSocket();

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [connectWebSocket]);

  // 当 taskId 变化时，自动加载任务历史
  // 但如果是新建任务（从空 taskId 变为有 taskId），则不需要 loadTask
  const prevTaskIdRef = useRef<string>('');
  useEffect(() => {
    if (socket && socket.readyState === WebSocket.OPEN && taskId) {
      // 如果之前没有 taskId，现在有了，说明是新建任务，不需要 loadTask
      const isNewTask = !prevTaskIdRef.current && taskId;
      
      if (!isNewTask) {
        console.log(`[WebSocketProvider] Auto-loading task: ${taskId}`);
        socket.send(
          JSON.stringify({
            type: "loadTask",
            data: { taskId },
          })
        );
      } else {
        console.log(`[WebSocketProvider] Skip loadTask for new task: ${taskId}`);
      }
      
      prevTaskIdRef.current = taskId;
    }
  }, [socket, taskId]);



  return (
    <WebSocketContext.Provider
      value={{
        socket,
        displayMessages,
        sendMessage,
        setTaskId,
        taskHistories,
        taskId,
        subscribe,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

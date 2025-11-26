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
import { useMessages } from "../messages";
import { DisplayMessageType } from "@/messages/types";
import { toast } from "@/utils/toast";

type Unsubscribe = () => void;
type Listener<T extends SERVER_SEND_MESSAGE_NAME> = (data: ServerSendMessageData<T>) => void;

interface WebSocketContextType {
  socket: WebSocket | null;
  taskId: string;
  setTaskId: React.Dispatch<React.SetStateAction<string>>;
  taskHistories: Array<{ taskId: string; title: string }>;
  displayMessages: DisplayMessageType[];
  isLoading: boolean;
  sendMessage: <T extends USER_SEND_MESSAGE_NAME>(newMessage: WebSocketMessage<T>) => void;
  subscribe: <T extends SERVER_SEND_MESSAGE_NAME>(type: T, listener: Listener<T>) => Unsubscribe;
  createNewConversation: () => void;
  registerInputFocus: (focusFn: () => void) => void;
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
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { processReceivedMessage, updateMessage, clearMessages, combinedMessages: displayMessages } = useMessages();
  const listenersRef = useRef<Record<SERVER_SEND_MESSAGE_NAME, Listener<any>[]>>({} as any);
  const inputFocusRef = useRef<(() => void) | null>(null);

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
          if(ackData.targetMessage.type === 'userSendMessage') {
            // 收到 ack 后开始 loading
            setIsLoading(true);
          }
        }
        
        // 监听 conversationOver 消息，停止 loading
        if (newMessage.type === 'conversationOver') {
          console.log(`[WebSocketProvider] Conversation over, stopping loading`);
          setIsLoading(false);
        }
        
        // 监听 interrupt 消息，中断当前输出
        if (newMessage.type === 'interrupt') {
          console.log(`[WebSocketProvider] Conversation interrupted, stopping output`);
          setIsLoading(false);
        }
        
        // 监听 alert 消息，中断当前输出并弹出 toast
        if (newMessage.type === 'alert') {
          console.log(`[WebSocketProvider] Alert received, stopping output`);
          setIsLoading(false);
          const alertData = newMessage.data as { message: string };
          toast.error(alertData.message);
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

    // userSendMessage 和 interrupt 需要添加到消息列表中
    // resume、loadTask 等控制消息不需要显示
    if (messageToSend.type === "userSendMessage") {
      updateMessage({ ...messageToSend, data: { ...messageToSend.data, status: "pending" } });
    } else if (messageToSend.type === "interrupt") {
      updateMessage(messageToSend);
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
  const prevTaskIdRef = useRef<string>('');
  
  useEffect(() => {
    console.log(`[WebSocketProvider] taskId changed: ${taskId}, prev: ${prevTaskIdRef.current}, socket ready: ${socket?.readyState === WebSocket.OPEN}`);
    
    if (socket && socket.readyState === WebSocket.OPEN && taskId && prevTaskIdRef.current !== taskId) {
      console.log(`[WebSocketProvider] Sending loadTask for: ${taskId}`);
      socket.send(
        JSON.stringify({
          type: "loadTask",
          data: { taskId },
        })
      );
      prevTaskIdRef.current = taskId;
    }
  }, [socket, taskId]);

  // 注册输入框焦点函数
  const registerInputFocus = useCallback((focusFn: () => void) => {
    inputFocusRef.current = focusFn;
  }, []);

  // 创建新对话
  const createNewConversation = useCallback(() => {
    // 清空消息
    clearMessages();
    
    // 清空 taskId
    setTaskId('');
    prevTaskIdRef.current = '';
    
    console.log(`[WebSocketProvider] Created new conversation`);
  }, [clearMessages]);

  return (
    <WebSocketContext.Provider
      value={{
        socket,
        displayMessages,
        sendMessage,
        setTaskId,
        taskHistories,
        taskId,
        isLoading,
        subscribe,
        createNewConversation,
        registerInputFocus,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

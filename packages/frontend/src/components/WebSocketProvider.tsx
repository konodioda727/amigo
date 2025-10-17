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
  setTaskId: (taskId: string) => void;
  taskHistories: ServerSendMessageData<'connected'>['sessionHistories']
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
  const [taskHistories, setTaskHistories] = useState<
    ServerSendMessageData<"connected">["sessionHistories"]
  >([]);
  const { processReceivedMessage, updateMessage, combinedMessages: displayMessages } = useMessages();
  const listenersRef = useRef<Record<SERVER_SEND_MESSAGE_NAME, any[]>>({} as any);

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
        if(newMessage.type === 'connected') {
          setTaskHistories((newMessage as WebSocketMessage<'connected'>).data.sessionHistories || [])
        }
        processReceivedMessage(newMessage);
        // Notify listeners
        const messageType = newMessage.type as SERVER_SEND_MESSAGE_NAME;
        const listeners = listenersRef.current[messageType];
        if (listeners) {
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

  const sendMessage = <T extends USER_SEND_MESSAGE_NAME>(newMessage: WebSocketMessage<T>) => {
    updateMessage({ ...newMessage, data: { ...newMessage.data, status: "pending" } });
    socket?.send(JSON.stringify(newMessage));
  };

  useEffect(() => {
    const ws = connectWebSocket();

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [connectWebSocket]);

  return (
    <WebSocketContext.Provider
      value={{
        socket,
        displayMessages,
        sendMessage,
        taskHistories,
        taskId,
        setTaskId,
        subscribe,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

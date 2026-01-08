import type {
  SERVER_SEND_MESSAGE_NAME,
  ServerSendMessageData,
  USER_SEND_MESSAGE_NAME,
  WebSocketMessage,
} from "@amigo-llm/types";
import { useCallback } from "react";
import { useWebSocketContext } from "../context/WebSocketContext";
import type { UseWebSocketReturn } from "../types/hooks";

/**
 * Hook to access WebSocket connection and messaging functionality.
 * Provides connection state, connection methods, and message operations.
 *
 * @returns WebSocket connection state and methods
 * @throws {Error} If used outside of WebSocketProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { status, isConnected, connect, disconnect, send, subscribe } = useWebSocket();
 *
 *   useEffect(() => {
 *     const unsubscribe = subscribe('message', (data) => {
 *       console.log('Received message:', data);
 *     });
 *     return unsubscribe;
 *   }, [subscribe]);
 *
 *   return (
 *     <div>
 *       <p>Status: {status}</p>
 *       <button onClick={connect} disabled={isConnected}>Connect</button>
 *       <button onClick={disconnect} disabled={!isConnected}>Disconnect</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useWebSocket(): UseWebSocketReturn {
  const context = useWebSocketContext();
  const { store } = context;

  // Get connection state
  const status = store((state) => state.connectionStatus);
  const isConnected = status === "connected";

  // Connection methods
  const connect = useCallback(() => {
    store.getState().connect();
  }, [store]);

  const disconnect = useCallback(() => {
    store.getState().disconnect();
  }, [store]);

  const reconnect = useCallback(() => {
    store.getState().disconnect();
    setTimeout(() => {
      store.getState().connect();
    }, 100);
  }, [store]);

  // Message methods
  const send = useCallback(
    <T extends USER_SEND_MESSAGE_NAME>(taskId: string, message: WebSocketMessage<T>) => {
      store.getState().sendMessage(taskId, message);
    },
    [store],
  );

  const subscribe = useCallback(
    <T extends SERVER_SEND_MESSAGE_NAME>(
      type: T,
      listener: (data: ServerSendMessageData<T>) => void,
    ) => {
      return store.getState().subscribe(type, listener);
    },
    [store],
  );

  return {
    status,
    isConnected,
    connect,
    disconnect,
    reconnect,
    send,
    subscribe,
  };
}

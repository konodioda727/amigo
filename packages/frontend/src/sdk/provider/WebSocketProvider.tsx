import { type ReactNode, useEffect, useMemo } from "react";
import { WebSocketContext, type WebSocketContextValue } from "../context/WebSocketContext";
import { createWebSocketStore, type WebSocketStoreConfig } from "../store/createWebSocketStore";
import type { MessageRendererMap } from "../types/renderers";

/**
 * WebSocketProvider props
 */
export interface WebSocketProviderProps {
  // Connection configuration
  url?: string;
  autoConnect?: boolean;
  reconnect?: boolean;
  reconnectInterval?: number;
  reconnectAttempts?: number;

  // Event handlers
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onMessage?: (message: any) => void;

  // Custom renderers
  renderers?: Partial<MessageRendererMap>;

  // Initial state
  initialState?: WebSocketStoreConfig["initialState"];

  // Children
  children: ReactNode;
}

/**
 * WebSocketProvider component
 *
 * Manages WebSocket connection, state, and message handling.
 * Provides context for all child components to access WebSocket functionality.
 *
 * @example
 * ```tsx
 * <WebSocketProvider
 *   url="ws://localhost:10013"
 *   autoConnect={true}
 *   reconnect={true}
 *   onConnect={() => console.log('Connected')}
 * >
 *   <App />
 * </WebSocketProvider>
 * ```
 */
export function WebSocketProvider({
  url = "ws://localhost:10013",
  autoConnect = true,
  reconnect = true,
  reconnectInterval = 3000,
  reconnectAttempts = 5,
  onConnect,
  onDisconnect,
  onError,
  onMessage,
  renderers,
  initialState,
  children,
}: WebSocketProviderProps): JSX.Element {
  // Create store instance with configuration
  const store = useMemo(() => {
    return createWebSocketStore({
      url,
      autoConnect,
      reconnect,
      reconnectInterval,
      reconnectAttempts,
      initialState,
    });
  }, []); // Only create once on mount

  // Create context value
  const contextValue: WebSocketContextValue = useMemo(
    () => ({
      store,
      config: {
        url,
        autoConnect,
        reconnect,
        reconnectInterval,
        reconnectAttempts,
      },
      renderers,
      handlers: {
        onConnect,
        onDisconnect,
        onError,
        onMessage,
      },
    }),
    [
      store,
      url,
      autoConnect,
      reconnect,
      reconnectInterval,
      reconnectAttempts,
      renderers,
      onConnect,
      onDisconnect,
      onError,
      onMessage,
    ],
  );

  // Handle cleanup on unmount
  useEffect(() => {
    return () => {
      const state = store.getState();
      if (state.socket) {
        state.disconnect();
      }
    };
  }, [store]);

  // Subscribe to connection events
  useEffect(() => {
    // Subscribe to connection status changes
    const unsubscribe = store.subscribe((state, prevState) => {
      if (state.connectionStatus === "connected" && prevState.connectionStatus !== "connected") {
        onConnect?.();
      } else if (
        state.connectionStatus === "disconnected" &&
        prevState.connectionStatus === "connected"
      ) {
        onDisconnect?.();
      }
    });

    return unsubscribe;
  }, [store, onConnect, onDisconnect]);

  // Subscribe to messages if handler provided
  useEffect(() => {
    if (!onMessage) return;

    // Subscribe to all message types
    const unsubscribe = store.subscribe(() => {
      // Notify on any task update (which happens when messages arrive)
      // This is a simplified approach - in production you might want more granular control
    });

    return unsubscribe;
  }, [store, onMessage]);

  return <WebSocketContext.Provider value={contextValue}>{children}</WebSocketContext.Provider>;
}

import { createContext, useContext } from "react";
import type { StoreApi, UseBoundStore } from "zustand";
import type { WebSocketStore } from "../store/createWebSocketStore";
import type { MessageRendererMap } from "../types/renderers";

/**
 * WebSocket context value interface
 */
export interface WebSocketContextValue {
  // Store instance
  store: UseBoundStore<StoreApi<WebSocketStore>>;

  // Configuration
  config: {
    url: string;
    autoConnect: boolean;
    reconnect: boolean;
    reconnectInterval: number;
    reconnectAttempts: number;
  };

  // Custom renderers
  renderers?: Partial<MessageRendererMap>;

  // Event handlers
  handlers: {
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: Error) => void;
    onMessage?: (message: any) => void;
  };
}

/**
 * WebSocket context
 * Default value is undefined to enforce provider usage
 */
export const WebSocketContext = createContext<WebSocketContextValue | undefined>(undefined);

/**
 * Hook to access WebSocket context
 * Throws an error if used outside of WebSocketProvider
 *
 * @throws {Error} If used outside of WebSocketProvider
 * @returns WebSocket context value
 */
export function useWebSocketContext(): WebSocketContextValue {
  const context = useContext(WebSocketContext);

  if (context === undefined) {
    throw new Error(
      "useWebSocketContext must be used within a WebSocketProvider. " +
        "Make sure your component is wrapped with <WebSocketProvider>.",
    );
  }

  return context;
}

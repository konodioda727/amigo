import type { StateCreator } from "zustand";
import { isLocalhost } from "@/utils/isLocalhost";
import type { WebSocketStore } from "../websocket";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

export interface ConnectionSlice {
  socket: WebSocket | null;
  connectionStatus: ConnectionStatus;
  connect: () => void;
  disconnect: () => void;
}

export interface ConnectionSliceConfig {
  url?: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  reconnectAttempts?: number;
}

export const createConnectionSlice =
  (config?: ConnectionSliceConfig): StateCreator<WebSocketStore, [], [], ConnectionSlice> =>
  (set, get) => {
    const defaultUrl = `${isLocalhost() ? "ws" : "wss"}://${window.location.hostname}:10013`;
    const wsUrl = config?.url || defaultUrl;
    const reconnectEnabled = config?.reconnect ?? true;
    const reconnectInterval = config?.reconnectInterval ?? 3000;
    const reconnectAttempts = config?.reconnectAttempts ?? 5;

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectCount = 0;
    let manualDisconnect = false;
    let activeSocket: WebSocket | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const shouldRetry = () => reconnectAttempts < 0 || reconnectCount < reconnectAttempts;

    const scheduleReconnect = () => {
      if (!reconnectEnabled || manualDisconnect) {
        set({ socket: null, connectionStatus: "disconnected" });
        return;
      }
      if (!shouldRetry()) {
        set({ socket: null, connectionStatus: "disconnected" });
        return;
      }

      clearReconnectTimer();
      reconnectCount += 1;
      set({ socket: null, connectionStatus: "reconnecting" });

      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        get().connect();
      }, reconnectInterval);
    };

    return {
      socket: null,
      connectionStatus: "disconnected",

      connect: () => {
        const { socket, connectionStatus } = get();
        if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
          return;
        }
        if (connectionStatus === "connecting") {
          return;
        }

        manualDisconnect = false;
        clearReconnectTimer();
        set({ connectionStatus: reconnectCount > 0 ? "reconnecting" : "connecting" });

        const ws = new WebSocket(wsUrl);
        activeSocket = ws;

        ws.onopen = () => {
          if (activeSocket !== ws) return;
          reconnectCount = 0;
          set({ socket: ws, connectionStatus: "connected" });
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            get().processMessage(message);
          } catch (error) {
            console.error("[WebSocketStore] Failed to parse message:", error);
          }
        };

        ws.onclose = () => {
          if (activeSocket !== ws) return;
          activeSocket = null;
          scheduleReconnect();
        };

        ws.onerror = (error) => {
          console.error("[WebSocketStore] WebSocket error:", error);
        };
      },

      disconnect: () => {
        manualDisconnect = true;
        reconnectCount = 0;
        clearReconnectTimer();

        const currentActiveSocket = activeSocket;
        const { socket } = get();
        if (currentActiveSocket) {
          currentActiveSocket.close();
          activeSocket = null;
        }
        if (socket && socket !== currentActiveSocket) {
          socket.close();
        }
        set({ socket: null, connectionStatus: "disconnected" });
      },
    };
  };

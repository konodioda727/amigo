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

export const createConnectionSlice: StateCreator<WebSocketStore, [], [], ConnectionSlice> = (
  set,
  get,
) => ({
  socket: null,
  connectionStatus: "disconnected",

  connect: () => {
    const { socket } = get();
    if (socket?.readyState === WebSocket.OPEN) {
      console.log("[ConnectionSlice] Already connected");
      return;
    }

    console.log("[ConnectionSlice] Connecting...");
    set({ connectionStatus: "connecting" });
    const ws = new WebSocket(`${isLocalhost() ? "ws" : "wss"}://${window.location.hostname}:10013`);

    ws.onopen = () => {
      console.log("[ConnectionSlice] Connected, readyState:", ws.readyState);
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
      console.log("[ConnectionSlice] Disconnected");
      set({ socket: null, connectionStatus: "disconnected" });
    };

    ws.onerror = (error) => {
      console.error("[WebSocketStore] WebSocket error:", error);
    };
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.close();
      set({ socket: null, connectionStatus: "disconnected" });
    }
  },
});

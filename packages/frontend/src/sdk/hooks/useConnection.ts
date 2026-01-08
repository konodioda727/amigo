import { useMemo } from "react";
import { useWebSocketContext } from "../context/WebSocketContext";
import type { UseConnectionReturn } from "../types/hooks";

/**
 * Hook to access WebSocket connection state.
 * Provides connection status and derived boolean flags for common connection states.
 * Uses Zustand selectors for efficient re-renders (only updates when connection state changes).
 *
 * @returns Connection state and derived flags
 * @throws {Error} If used outside of WebSocketProvider
 *
 * @example
 * ```tsx
 * function ConnectionIndicator() {
 *   const { status, isConnected, isConnecting, isDisconnected } = useConnection();
 *
 *   return (
 *     <div>
 *       {isConnecting && <span>Connecting...</span>}
 *       {isConnected && <span className="text-green-500">Connected</span>}
 *       {isDisconnected && <span className="text-red-500">Disconnected</span>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useConnection(): UseConnectionReturn {
  const context = useWebSocketContext();
  const { store } = context;

  // Use Zustand selector for efficient re-renders
  const status = store((state) => state.connectionStatus);

  // Derive boolean flags from status
  const derived = useMemo(
    () => ({
      isConnected: status === "connected",
      isConnecting: status === "connecting",
      isDisconnected: status === "disconnected",
    }),
    [status],
  );

  return {
    status,
    ...derived,
    error: null, // Error handling can be added in future iterations
  };
}

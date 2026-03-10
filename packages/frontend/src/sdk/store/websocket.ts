import { createWebSocketStore } from "./createWebSocketStore";

// Export types
export type { WebSocketStore, WebSocketStoreConfig } from "./createWebSocketStore";
export type { ConnectionStatus } from "./slices/connectionSlice";

// Default store instance for backward compatibility
const defaultStore = createWebSocketStore();

// Hook to use the default store - this maintains the same API as before
export const useWebSocketStore = defaultStore;

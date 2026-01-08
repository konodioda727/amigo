import { create, type StoreApi, type UseBoundStore } from "zustand";
import { type ConnectionSlice, createConnectionSlice } from "./slices/connectionSlice";
import { createMentionSlice, type MentionSlice } from "./slices/mentionSlice";
import { createMessageSlice, type MessageSlice } from "./slices/messageSlice";
import { createTaskSlice, type TaskSlice } from "./slices/taskSlice";

export type WebSocketStore = ConnectionSlice & TaskSlice & MessageSlice & MentionSlice;

export interface WebSocketStoreConfig {
  // Connection configuration
  url?: string;
  autoConnect?: boolean;
  reconnect?: boolean;
  reconnectInterval?: number;
  reconnectAttempts?: number;

  // Initial state
  initialState?: {
    mainTaskId?: string;
    tasks?: Record<string, TaskSlice["tasks"][string]>;
  };
}

/**
 * Creates a new WebSocket store instance with the given configuration.
 * This factory function allows multiple independent store instances to be created,
 * which is useful for testing or when multiple WebSocket connections are needed.
 *
 * @param config - Configuration options for the store
 * @returns A Zustand store hook
 */
export function createWebSocketStore(
  config?: WebSocketStoreConfig,
): UseBoundStore<StoreApi<WebSocketStore>> {
  const store = create<WebSocketStore>()((...a) => {
    const connectionSlice = createConnectionSlice(...a);
    const taskSlice = createTaskSlice(...a);
    const messageSlice = createMessageSlice(...a);
    const mentionSlice = createMentionSlice(...a);

    return {
      ...connectionSlice,
      ...taskSlice,
      ...messageSlice,
      ...mentionSlice,

      // Apply initial state if provided
      ...(config?.initialState?.mainTaskId && { mainTaskId: config.initialState.mainTaskId }),
      ...(config?.initialState?.tasks && { tasks: config.initialState.tasks }),
    };
  });

  // Auto-connect if configured
  if (config?.autoConnect) {
    store.getState().connect();
  }

  return store;
}

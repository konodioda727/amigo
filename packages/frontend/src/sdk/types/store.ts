import type {
  SERVER_SEND_MESSAGE_NAME,
  ServerSendMessageData,
  USER_SEND_MESSAGE_NAME,
  WebSocketMessage,
} from "@amigo-llm/types";
import type { DisplayMessageType } from "../messages/types";

/**
 * Connection status
 */
export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

/**
 * Task status
 */
export type TaskStatus = "active" | "completed" | "interrupted" | "error";

/**
 * Task state
 */
export interface TaskState {
  rawMessages: Array<
    WebSocketMessage<SERVER_SEND_MESSAGE_NAME> | WebSocketMessage<"userSendMessage">
  >;
  displayMessages: DisplayMessageType[];
  isLoading: boolean;
  lastUpdateTime: number;
}

/**
 * Task hierarchy
 */
export interface TaskHierarchy {
  taskId: string;
  parentTaskId?: string;
  children: TaskHierarchy[];
}

/**
 * Mention item
 */
export interface MentionItem {
  id: string;
  label: string;
  type: "task" | "user" | "system";
}

/**
 * Message listener
 */
export type Listener<T extends SERVER_SEND_MESSAGE_NAME> = (data: ServerSendMessageData<T>) => void;

/**
 * Unsubscribe function
 */
export type Unsubscribe = () => void;

/**
 * WebSocket store interface
 */
export interface WebSocketStore {
  // Connection state
  socket: WebSocket | null;
  connectionStatus: ConnectionStatus;

  // Task state
  tasks: Record<string, TaskState>;
  mainTaskId: string;
  activeTaskId: string | null;
  taskHistories: Array<{ taskId: string; title: string; updatedAt: string }>;

  // Mention state
  followupQueue: string[];
  pendingMention: string | null;

  // Message listeners
  listeners: Record<string, Set<Listener<SERVER_SEND_MESSAGE_NAME>>>;

  // Connection methods
  connect: () => void;
  disconnect: () => void;

  // Message methods
  sendMessage: <T extends USER_SEND_MESSAGE_NAME>(
    taskId: string,
    message: WebSocketMessage<T>,
  ) => void;
  processMessage: (message: WebSocketMessage<SERVER_SEND_MESSAGE_NAME>) => void;
  subscribe: <T extends SERVER_SEND_MESSAGE_NAME>(type: T, listener: Listener<T>) => Unsubscribe;

  // Task methods
  registerTask: (taskId: string) => void;
  unregisterTask: (taskId: string) => void;
  setActiveTask: (taskId: string | null) => void;
  setLoading: (taskId: string, isLoading: boolean) => void;
  clearMessages: (taskId: string) => void;
  setMainTaskId: (taskId: string) => void;
  createNewConversation: () => void;
  handleSessionHistories: (
    histories: Array<{ taskId: string; title: string; updatedAt: string }>,
  ) => void;

  // Message methods
  updateUserMessageStatus: (
    taskId: string,
    message: string,
    status: "pending" | "acked" | "failed",
  ) => void;
  handleTaskHistory: (
    taskId: string,
    messages: Array<WebSocketMessage<SERVER_SEND_MESSAGE_NAME>>,
  ) => void;
  addMessageToTask: (taskId: string, message: WebSocketMessage<SERVER_SEND_MESSAGE_NAME>) => void;
  notifyListeners: (message: WebSocketMessage<SERVER_SEND_MESSAGE_NAME>) => void;

  // Mention methods
  updateFollowupQueue: () => void;
  mentionNextInQueue: () => void;
  clearPendingMention: () => void;
}

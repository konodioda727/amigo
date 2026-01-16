import type {
  SERVER_SEND_MESSAGE_NAME,
  ServerSendMessageData,
  USER_SEND_MESSAGE_NAME,
  WebSocketMessage,
} from "@amigo-llm/types";
import type { DisplayMessageType } from "../messages/types";
import type {
  ConnectionStatus,
  MentionItem,
  TaskHierarchy,
  TaskState,
  TaskStatus,
  Unsubscribe,
} from "./store";

/**
 * useWebSocket hook return type
 */
export interface UseWebSocketReturn {
  // Connection state
  status: ConnectionStatus;
  isConnected: boolean;

  // Connection methods
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;

  // Message methods
  send: <T extends USER_SEND_MESSAGE_NAME>(taskId: string, message: WebSocketMessage<T>) => void;

  // Event subscription
  subscribe: <T extends SERVER_SEND_MESSAGE_NAME>(
    type: T,
    listener: (data: ServerSendMessageData<T>) => void,
  ) => Unsubscribe;
}

/**
 * useMessages hook return type
 */
export interface UseMessagesReturn {
  // Messages for current task
  messages: DisplayMessageType[];
  rawMessages: WebSocketMessage<SERVER_SEND_MESSAGE_NAME>[];

  // Message operations
  sendMessage: (message: string) => void;
  clearMessages: () => void;
}

/**
 * useConnection hook return type
 */
export interface UseConnectionReturn {
  status: ConnectionStatus;
  isConnected: boolean;
  isConnecting: boolean;
  isDisconnected: boolean;
  error: Error | null;
}

/**
 * useTasks hook return type
 */
export interface UseTasksReturn {
  // Task data
  tasks: Record<string, TaskState>;
  currentTaskId: string | null;
  mainTaskId: string | null;

  // Task operations
  switchTask: (taskId: string) => void;
  getTaskHierarchy: (taskId: string) => TaskHierarchy;
  getTaskStatus: (taskId: string) => TaskStatus;
}

/**
 * useMentions hook return type
 */
export interface UseMentionsReturn {
  // Available mentions
  mentions: MentionItem[];

  // Mention operations
  getMentionSuggestions: (query: string) => MentionItem[];

  // Followup queue
  followupQueue: string[];
  pendingMention: string | null;
}

/**
 * useSendMessage hook return type
 */
export interface UseSendMessageReturn {
  sendMessage: (message: string, taskId?: string) => void;
  sendCreateTask: (message: string) => void;
  sendInterrupt: (taskId?: string) => void;
  sendResume: (taskId?: string) => void;
  sendLoadTask: (taskId: string) => void;
}

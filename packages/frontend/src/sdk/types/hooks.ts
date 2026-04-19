import type {
  ContextUsageStatus,
  ExecutionTaskStatus,
  SERVER_SEND_MESSAGE_NAME,
  ServerSendMessageData,
  USER_SEND_MESSAGE_NAME,
  UserMessageAttachment,
  UserSendMessageData,
  WebSocketMessage,
  WorkflowState,
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
  taskStatusMaps: Record<string, Record<string, ExecutionTaskStatus>>;
  taskAutoApproveToolNameMaps: Record<string, string[]>;
  taskContextUsageMaps: Record<string, ContextUsageStatus | undefined>;
  taskContextMaps: Record<string, unknown>;
  taskWorkflowStateMaps: Record<string, WorkflowState | undefined>;

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
  sendMessage: (
    message: string,
    taskId?: string,
    attachments?: UserMessageAttachment[],
    modelConfigSnapshot?: UserSendMessageData<"userSendMessage">["modelConfigSnapshot"],
  ) => void;
  sendCreateTask: (
    message: string,
    attachments?: UserMessageAttachment[],
    context?: unknown,
    modelConfigSnapshot?: UserSendMessageData<"createTask">["modelConfigSnapshot"],
  ) => void;
  sendInterrupt: (taskId?: string) => void;
  sendResume: (
    taskId?: string,
    modelConfigSnapshot?: UserSendMessageData<"resume">["modelConfigSnapshot"],
  ) => void;
  sendLoadTask: (taskId: string) => void;
  sendConfirm: (taskId: string) => void;
  sendReject: (taskId: string) => void;
  sendDeleteTask: (taskId: string) => void;
  sendUpdateAutoApproveTools: (toolNames: string[], taskId?: string) => void;
}

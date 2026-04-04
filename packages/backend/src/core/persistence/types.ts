import type {
  ChatMessage,
  ContextUsageStatus,
  ConversationStatus,
  PendingToolCall,
  SERVER_SEND_MESSAGE_NAME,
  SubTaskStatus,
  USER_SEND_MESSAGE_NAME,
  WebSocketMessage,
} from "@amigo-llm/types";
import type { ModelConfigSnapshot } from "../model/contextConfig";

export interface ConversationPersistenceRecord {
  taskId: string;
  fatherTaskId?: string;
  conversationStatus: ConversationStatus;
  initialSystemPrompt?: string;
  toolNames: string[];
  context: unknown;
  modelConfigSnapshot?: ModelConfigSnapshot;
  autoApproveToolNames: string[];
  pendingToolCall: PendingToolCall | null;
  subTasks: Record<string, SubTaskStatus>;
  contextUsage?: ContextUsageStatus;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  websocketMessages: WebSocketMessage<USER_SEND_MESSAGE_NAME | SERVER_SEND_MESSAGE_NAME>[];
}

export interface ConversationRelation {
  taskId: string;
  fatherTaskId?: string;
}

export interface ConversationSessionHistory {
  taskId: string;
  title: string;
  updatedAt: string;
}

export interface ConversationPersistenceProvider {
  exists(taskId: string): boolean;
  load(taskId: string): ConversationPersistenceRecord | null;
  save(record: ConversationPersistenceRecord): boolean;
  delete(taskId: string): boolean;
  listConversationRelations(): ConversationRelation[];
  listSessionHistories(userId?: string): ConversationSessionHistory[];
}

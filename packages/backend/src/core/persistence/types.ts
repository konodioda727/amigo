import type {
  ChatMessage,
  ContextUsageStatus,
  ConversationStatus,
  ExecutionTaskStatus,
  PendingToolCall,
  SERVER_SEND_MESSAGE_NAME,
  USER_SEND_MESSAGE_NAME,
  WebSocketMessage,
  WorkflowState,
} from "@amigo-llm/types";
import type { AmigoModelMessage } from "../model";
import type { ModelConfigSnapshot } from "../model/contextConfig";

export interface ConversationContextSnapshotRecord {
  requestId: string;
  conversationId: string;
  conversationType?: string;
  model: string;
  provider?: string;
  configId?: string;
  workflowPhase?: string;
  agentRole?: string;
  messageCount: number;
  toolNames: string[];
  options?: Record<string, unknown>;
  messages: AmigoModelMessage[];
  createdAt: string;
}

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
  executionTasks: Record<string, ExecutionTaskStatus>;
  contextUsage?: ContextUsageStatus;
  workflowState?: WorkflowState;
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
  recordModelContextSnapshot?(record: ConversationContextSnapshotRecord): void | Promise<void>;
}

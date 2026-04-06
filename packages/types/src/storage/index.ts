import type { ConversationStatus } from "../conversation";
import type { ChatMessage } from "../websocketMessage";

/**
 * 存储类型
 */
export enum StorageType {
  /**
   * 完整消息
   */
  ORIGINAL = "original",
  /**
   * 发送给前端的消息
   */
  FRONT_END = "websocket",
  /**
   * 任务状态元数据
   */
  TASK_STATUS = "taskStatus",
}

export interface QueuedToolCall {
  toolName: string;
  params: unknown;
  toolCallId?: string;
  type: ChatMessage["type"];
  updateTime?: number;
}

/**
 * 待确认的工具调用
 */
export interface PendingToolCall extends QueuedToolCall {
  queuedToolCalls?: QueuedToolCall[];
}

/**
 * 子任务状态
 */
export interface SubTaskStatus {
  subTaskId?: string;
  status: "idle" | "running" | "waiting_user_input" | "wait_review" | "completed" | "failed";
  description?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface ContextUsageStatus {
  model: string;
  contextWindow: number;
  estimatedTokens: number;
  usageRatio: number;
  compressionThreshold: number;
  targetRatio: number;
  isCompressing: boolean;
  compressionCount: number;
  lastCompressionAt?: string;
}

/**
 * 任务状态元数据接口
 */
export interface TaskStatusMetadata {
  taskId: string;
  fatherTaskId?: string;
  conversationStatus: ConversationStatus;
  initialSystemPrompt?: string;
  toolNames: string[];
  context?: unknown;
  autoApproveToolNames?: string[];
  pendingToolCall?: PendingToolCall;
  subTasks?: Record<string, SubTaskStatus>;
  contextUsage?: ContextUsageStatus;
  createdAt: string;
  updatedAt: string;
}

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

/**
 * 待确认的工具调用
 */
export interface PendingToolCall {
  toolName: string;
  params: unknown;
  fullToolCall: string;
  type: ChatMessage["type"];
}

/**
 * 子任务状态
 */
export interface SubTaskStatus {
  subTaskId?: string;
  status: "idle" | "running" | "completed" | "failed";
  startedAt?: string;
  completedAt?: string;
  error?: string;
  index?: number;
}

/**
 * 任务状态元数据接口
 */
export interface TaskStatusMetadata {
  taskId: string;
  fatherTaskId?: string;
  conversationStatus: ConversationStatus;
  toolNames: string[];
  pendingToolCall?: PendingToolCall;
  subTasks?: Record<string, SubTaskStatus>;
  createdAt: string;
  updatedAt: string;
}

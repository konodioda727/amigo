import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type ChatMessage,
  type ExecutionTaskStatus,
  type SERVER_SEND_MESSAGE_NAME,
  StorageType,
  type TaskStatusMetadata,
  type USER_SEND_MESSAGE_NAME,
  type WebSocketMessage,
} from "@amigo-llm/types";
import { getStorageRootPath, getTaskStoragePath } from "@/core/storage";
import { getTaskId } from "@/core/templates/checklistParser";
import { logger } from "@/utils/logger";
import type {
  ConversationPersistenceProvider,
  ConversationPersistenceRecord,
  ConversationRelation,
  ConversationSessionHistory,
} from "./types";

const messageFileName = (storageType: StorageType): string => `${storageType}.json`;

const ensureDirectoryExists = (directory: string): void => {
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
};

const readJson = <T>(filePath: string): T | null => {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch (error) {
    logger.error(
      `[FileConversationPersistenceProvider] 读取 JSON 失败: ${filePath}, error: ${error}`,
    );
    return null;
  }
};

const normalizeExecutionTasks = (
  rawExecutionTasks: Record<string, ExecutionTaskStatus> | undefined,
): Record<string, ExecutionTaskStatus> => {
  const normalizedExecutionTasks: Record<string, ExecutionTaskStatus> = {};
  for (const [key, status] of Object.entries(rawExecutionTasks || {})) {
    const taskKey = getTaskId(key) || key;
    const rawStatus = status.status as string;
    const normalizedStatus = rawStatus === "waiting_user_input" ? "interrupted" : status.status;
    const nextStatus: ExecutionTaskStatus = {
      ...status,
      status: normalizedStatus,
      description: status.description || key,
    };
    const existing = normalizedExecutionTasks[taskKey];
    if (!existing || (!existing.executionTaskId && nextStatus.executionTaskId)) {
      normalizedExecutionTasks[taskKey] = nextStatus;
    } else {
      normalizedExecutionTasks[taskKey] = {
        ...existing,
        ...nextStatus,
        description: existing.description || nextStatus.description,
      };
    }
  }
  return normalizedExecutionTasks;
};

const toConversationRecord = (
  taskId: string,
  taskStatus: Partial<TaskStatusMetadata> | null,
  messages: ChatMessage[],
  websocketMessages: WebSocketMessage<USER_SEND_MESSAGE_NAME | SERVER_SEND_MESSAGE_NAME>[],
): ConversationPersistenceRecord => {
  const normalizedExecutionTasks = normalizeExecutionTasks(taskStatus?.executionTasks);
  return {
    taskId,
    fatherTaskId: taskStatus?.fatherTaskId,
    conversationStatus: taskStatus?.conversationStatus || "idle",
    initialSystemPrompt: taskStatus?.initialSystemPrompt,
    toolNames: taskStatus?.toolNames || [],
    context: taskStatus?.context,
    autoApproveToolNames: taskStatus?.autoApproveToolNames || [],
    pendingToolCall: taskStatus?.pendingToolCall || null,
    executionTasks: normalizedExecutionTasks,
    contextUsage: taskStatus?.contextUsage,
    workflowState: taskStatus?.workflowState,
    createdAt: taskStatus?.createdAt || new Date().toISOString(),
    updatedAt: taskStatus?.updatedAt || taskStatus?.createdAt || new Date().toISOString(),
    messages,
    websocketMessages,
  };
};

const shouldSkipAutomationTriggeredConversation = (context: unknown): boolean => {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return false;
  }
  return "trigger" in context && (context as Record<string, unknown>).trigger === "automation";
};

class FileConversationPersistenceProvider implements ConversationPersistenceProvider {
  exists(taskId: string): boolean {
    const loaded = this.load(taskId);
    return !!loaded;
  }

  load(taskId: string): ConversationPersistenceRecord | null {
    const storagePath = getTaskStoragePath(taskId);
    const taskStatusPath = path.join(storagePath, `${StorageType.TASK_STATUS}.json`);
    const originalPath = path.join(storagePath, "messages", messageFileName(StorageType.ORIGINAL));
    const websocketPath = path.join(
      storagePath,
      "messages",
      messageFileName(StorageType.FRONT_END),
    );

    if (!existsSync(taskStatusPath) && !existsSync(originalPath) && !existsSync(websocketPath)) {
      return null;
    }

    const taskStatus = readJson<TaskStatusMetadata>(taskStatusPath);
    const original = readJson<{ messages?: ChatMessage[] }>(originalPath);
    const websocket = readJson<{
      messages?: WebSocketMessage<USER_SEND_MESSAGE_NAME | SERVER_SEND_MESSAGE_NAME>[];
    }>(websocketPath);

    return toConversationRecord(
      taskId,
      taskStatus,
      Array.isArray(original?.messages) ? original.messages : [],
      Array.isArray(websocket?.messages) ? websocket.messages : [],
    );
  }

  save(record: ConversationPersistenceRecord): boolean {
    try {
      const storagePath = getTaskStoragePath(record.taskId);
      const messagesPath = path.join(storagePath, "messages");
      ensureDirectoryExists(storagePath);
      ensureDirectoryExists(messagesPath);

      const metadata: TaskStatusMetadata = {
        taskId: record.taskId,
        fatherTaskId: record.fatherTaskId,
        conversationStatus: record.conversationStatus,
        initialSystemPrompt: record.initialSystemPrompt,
        toolNames: record.toolNames,
        context: record.context,
        autoApproveToolNames: record.autoApproveToolNames,
        pendingToolCall: record.pendingToolCall || undefined,
        executionTasks: record.executionTasks,
        contextUsage: record.contextUsage,
        workflowState: record.workflowState,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };

      writeFileSync(
        path.join(storagePath, `${StorageType.TASK_STATUS}.json`),
        JSON.stringify(metadata, null, 2),
        "utf-8",
      );
      writeFileSync(
        path.join(messagesPath, messageFileName(StorageType.ORIGINAL)),
        JSON.stringify({ messages: record.messages, updatedAt: record.updatedAt }, null, 2),
        "utf-8",
      );
      writeFileSync(
        path.join(messagesPath, messageFileName(StorageType.FRONT_END)),
        JSON.stringify(
          { messages: record.websocketMessages, updatedAt: record.updatedAt },
          null,
          2,
        ),
        "utf-8",
      );
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[FileConversationPersistenceProvider] 保存会话失败: ${errorMessage}`);
      return false;
    }
  }

  delete(taskId: string): boolean {
    const storagePath = getTaskStoragePath(taskId);
    if (!existsSync(storagePath)) {
      return false;
    }

    try {
      rmSync(storagePath, { recursive: true, force: true });
      logger.info(`[FileConversationPersistenceProvider] 已删除存储目录: ${storagePath}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[FileConversationPersistenceProvider] 删除会话失败: ${errorMessage}`);
      return false;
    }
  }

  listConversationRelations(): ConversationRelation[] {
    const storageRoot = getStorageRootPath();
    if (!existsSync(storageRoot)) {
      return [];
    }

    const relations: ConversationRelation[] = [];
    for (const entry of readdirSync(storageRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const taskId = entry.name;
      const taskStatusPath = path.join(storageRoot, taskId, `${StorageType.TASK_STATUS}.json`);
      const taskStatus = readJson<TaskStatusMetadata>(taskStatusPath);
      relations.push({
        taskId,
        fatherTaskId: taskStatus?.fatherTaskId,
      });
    }

    return relations;
  }

  listSessionHistories(userId?: string): ConversationSessionHistory[] {
    const storageRoot = getStorageRootPath();
    const sessionHistories: ConversationSessionHistory[] = [];

    if (!existsSync(storageRoot)) {
      return sessionHistories;
    }

    for (const entry of readdirSync(storageRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const taskId = entry.name;
      const taskRoot = path.join(storageRoot, taskId);
      const taskStatusPath = path.join(taskRoot, `${StorageType.TASK_STATUS}.json`);
      const frontendPath = path.join(taskRoot, "messages", messageFileName(StorageType.FRONT_END));

      const taskStatus = readJson<Partial<TaskStatusMetadata>>(taskStatusPath);
      if (taskStatus?.fatherTaskId) {
        continue;
      }
      if (
        userId?.trim() &&
        (!taskStatus?.context ||
          typeof taskStatus.context !== "object" ||
          !("userId" in taskStatus.context) ||
          typeof (taskStatus.context as { userId?: unknown }).userId !== "string" ||
          (taskStatus.context as { userId: string }).userId.trim() !== userId.trim())
      ) {
        continue;
      }
      if (shouldSkipAutomationTriggeredConversation(taskStatus?.context)) {
        continue;
      }

      const frontend = readJson<{
        updatedAt?: string;
        messages?: Array<{
          type?: string;
          data?: {
            message?: string;
            attachments?: Array<{ name?: string }>;
          };
        }>;
      }>(frontendPath);

      const firstUserMessage = frontend?.messages?.find((msg) => msg.type === "userSendMessage");
      if (!firstUserMessage) {
        continue;
      }

      const attachments = firstUserMessage.data?.attachments || [];
      const fallbackTitle =
        attachments.length > 0 ? `[附件] ${attachments[0]?.name || "未命名文件"}` : "";
      sessionHistories.push({
        taskId,
        title: firstUserMessage.data?.message || fallbackTitle || `Task ${taskId}`,
        updatedAt:
          frontend?.updatedAt ||
          taskStatus?.updatedAt ||
          taskStatus?.createdAt ||
          new Date().toISOString(),
      });
    }

    sessionHistories.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return sessionHistories;
  }
}

export const fileConversationPersistenceProvider = new FileConversationPersistenceProvider();

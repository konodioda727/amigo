import { randomUUID } from "node:crypto";
import type {
  SERVER_SEND_MESSAGE_NAME,
  USER_SEND_MESSAGE_NAME,
  WebSocketMessage,
} from "@amigo-llm/types";
import type { ConversationPersistenceRecord } from "../../../../backend/src/core/persistence/types";
import { parseJsonColumn } from "./mysql";

const CHAT_PREFIX = "chat:";
const WEBSOCKET_PREFIX = "ws:";

export type ConversationRow = {
  id: string;
  userId: string;
  parentId: string | null;
  status: string;
  contextJson: unknown;
  createdAt: string;
  updatedAt: string;
};

export type ConversationStateRow = {
  conversationId: string;
  initialSystemPrompt: string | null;
  toolNamesJson: unknown;
  modelConfigJson: unknown;
  autoApproveToolNamesJson: unknown;
  pendingToolCallJson: unknown;
  executionTasksJson: unknown;
  contextUsageJson: unknown;
  workflowStateJson: unknown;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessageRow = {
  id: string;
  conversationId: string;
  seq: number;
  role: string;
  messageType: string;
  content: string;
  attachmentsJson: unknown;
  partial: number;
  sourceUpdateTime: string | null;
  createdAt: string;
};

type PersistedWebSocketMessage = WebSocketMessage<
  USER_SEND_MESSAGE_NAME | SERVER_SEND_MESSAGE_NAME
>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export const parseMysqlDateTime = (value: unknown, fallback: string): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const raw = String(value || "").trim();
  if (!raw) {
    return fallback;
  }
  if (raw.includes("T")) {
    return new Date(raw).toISOString();
  }
  return new Date(`${raw.replace(" ", "T")}Z`).toISOString();
};

const parseUpdateTime = (value: unknown): number | undefined => {
  const iso = parseMysqlDateTime(value, "");
  if (!iso) {
    return undefined;
  }
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? timestamp : undefined;
};

export const shouldSkipAutomationTriggeredConversation = (context: unknown): boolean =>
  isPlainObject(context) && context.trigger === "automation";

export const buildSessionTitle = (record: ConversationPersistenceRecord): string | null => {
  const firstUserMessage = record.websocketMessages.find(
    (message: PersistedWebSocketMessage) => message.type === "userSendMessage",
  );
  if (!firstUserMessage || !isPlainObject(firstUserMessage.data)) {
    return null;
  }
  const data = firstUserMessage.data as Record<string, unknown>;

  const messageText = typeof data.message === "string" ? data.message.trim() : "";
  if (messageText) {
    return messageText;
  }

  const attachments = Array.isArray(data.attachments) ? data.attachments : [];
  if (
    attachments.length > 0 &&
    isPlainObject(attachments[0]) &&
    typeof attachments[0].name === "string"
  ) {
    return `[附件] ${attachments[0].name || "未命名文件"}`;
  }

  return `Task ${record.taskId}`;
};

export const buildMessageRows = (record: ConversationPersistenceRecord) => {
  const rows: Array<{
    id: string;
    seq: number;
    role: string;
    messageType: string;
    content: string;
    attachmentsJson: unknown;
    partial: number;
    sourceUpdateTime: string | null;
    createdAt: string;
  }> = [];

  for (const [index, message] of record.messages.entries()) {
    rows.push({
      id: randomUUID(),
      seq: index + 1,
      role: message.role,
      messageType: `${CHAT_PREFIX}${message.type}`,
      content: message.content,
      attachmentsJson: message.attachments || [],
      partial: message.partial ? 1 : 0,
      sourceUpdateTime: message.updateTime ? new Date(message.updateTime).toISOString() : null,
      createdAt: record.updatedAt,
    });
  }

  for (const [index, message] of record.websocketMessages.entries()) {
    rows.push({
      id: randomUUID(),
      seq: record.messages.length + index + 1,
      role: "system",
      messageType: `${WEBSOCKET_PREFIX}${message.type}`,
      content: JSON.stringify(message.data || {}),
      attachmentsJson: [],
      partial: message.data?.partial ? 1 : 0,
      sourceUpdateTime:
        typeof message.data?.updateTime === "number"
          ? new Date(message.data.updateTime).toISOString()
          : null,
      createdAt: record.updatedAt,
    });
  }

  return rows;
};

export const buildConversationPersistenceRecord = ({
  row,
  state,
  storedMessages,
}: {
  row: ConversationRow;
  state?: ConversationStateRow;
  storedMessages: ConversationMessageRow[];
}): ConversationPersistenceRecord => {
  const messages: ConversationPersistenceRecord["messages"] = [];
  const websocketMessages: ConversationPersistenceRecord["websocketMessages"] = [];

  for (const messageRow of storedMessages) {
    if (messageRow.messageType.startsWith(CHAT_PREFIX)) {
      messages.push({
        role: messageRow.role as "user" | "assistant" | "system",
        type: messageRow.messageType.slice(CHAT_PREFIX.length) as
          | USER_SEND_MESSAGE_NAME
          | SERVER_SEND_MESSAGE_NAME
          | "think"
          | "interrupt"
          | "askFollowupQuestion"
          | "system"
          | "compaction",
        content: messageRow.content,
        attachments: parseJsonColumn(messageRow.attachmentsJson, []),
        partial: !!messageRow.partial,
        ...(parseUpdateTime(messageRow.sourceUpdateTime)
          ? { updateTime: parseUpdateTime(messageRow.sourceUpdateTime) }
          : {}),
      });
      continue;
    }

    if (messageRow.messageType.startsWith(WEBSOCKET_PREFIX)) {
      const data = parseJsonColumn<Record<string, unknown>>(messageRow.content, {});
      websocketMessages.push({
        type: messageRow.messageType.slice(
          WEBSOCKET_PREFIX.length,
        ) as PersistedWebSocketMessage["type"],
        data: {
          ...data,
          partial: !!messageRow.partial,
          ...(parseUpdateTime(messageRow.sourceUpdateTime)
            ? { updateTime: parseUpdateTime(messageRow.sourceUpdateTime) }
            : {}),
        } as PersistedWebSocketMessage["data"],
      });
    }
  }

  return {
    taskId: row.id,
    ...(row.parentId ? { fatherTaskId: row.parentId } : {}),
    conversationStatus: row.status as ConversationPersistenceRecord["conversationStatus"],
    ...(state?.initialSystemPrompt?.trim()
      ? { initialSystemPrompt: state.initialSystemPrompt.trim() }
      : {}),
    toolNames: parseJsonColumn(state?.toolNamesJson, []),
    context: parseJsonColumn(row.contextJson, {}),
    modelConfigSnapshot: parseJsonColumn(state?.modelConfigJson, undefined),
    autoApproveToolNames: parseJsonColumn(state?.autoApproveToolNamesJson, []),
    pendingToolCall: parseJsonColumn(state?.pendingToolCallJson, null),
    executionTasks: parseJsonColumn(state?.executionTasksJson, {}),
    contextUsage: parseJsonColumn(state?.contextUsageJson, undefined),
    workflowState: parseJsonColumn(state?.workflowStateJson, undefined),
    createdAt: parseMysqlDateTime(row.createdAt, new Date(0).toISOString()),
    updatedAt: parseMysqlDateTime(row.updatedAt, new Date(0).toISOString()),
    messages,
    websocketMessages,
  };
};

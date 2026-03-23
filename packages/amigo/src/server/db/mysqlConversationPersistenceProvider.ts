import { randomUUID } from "node:crypto";
import { logger } from "@amigo-llm/backend";
import type {
  ConversationStatus,
  SERVER_SEND_MESSAGE_NAME,
  USER_SEND_MESSAGE_NAME,
  WebSocketMessage,
} from "@amigo-llm/types";
import type { RowDataPacket } from "mysql2/promise";
import type {
  ConversationPersistenceProvider,
  ConversationPersistenceRecord,
} from "../../../../backend/src/core/persistence/types";
import {
  ensureMysqlSchemaUpToDate,
  mysqlExecute,
  mysqlQuery,
  mysqlTransaction,
  parseJsonColumn,
} from "./mysql";

const CHAT_PREFIX = "chat:";
const WEBSOCKET_PREFIX = "ws:";

type ConversationRow = RowDataPacket & {
  id: string;
  user_id: string;
  parent_id: string | null;
  status: string;
  context_json: unknown;
  created_at: string;
  updated_at: string;
};

type ConversationStateRow = RowDataPacket & {
  conversation_id: string;
  initial_system_prompt: string | null;
  tool_names_json: unknown;
  auto_approve_tool_names_json: unknown;
  pending_tool_call_json: unknown;
  subtasks_json: unknown;
  context_usage_json: unknown;
};

type ConversationMessageRow = RowDataPacket & {
  conversation_id: string;
  seq: number;
  role: string;
  message_type: string;
  content: string;
  attachments_json: unknown;
  partial: number | boolean;
  source_update_time: string | null;
};

type PersistedWebSocketMessage = WebSocketMessage<
  USER_SEND_MESSAGE_NAME | SERVER_SEND_MESSAGE_NAME
>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const parseDateTime = (value: unknown, fallback: string): string => {
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
  const iso = parseDateTime(value, "");
  if (!iso) {
    return undefined;
  }
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? timestamp : undefined;
};

const shouldSkipAutomationTriggeredConversation = (context: unknown): boolean =>
  isPlainObject(context) && context.trigger === "automation";

const buildSessionTitle = (record: ConversationPersistenceRecord): string | null => {
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

const buildMessageRows = (record: ConversationPersistenceRecord) => {
  const rows: Array<{
    id: string;
    seq: number;
    role: string;
    messageType: string;
    content: string;
    attachmentsJson: string;
    partial: number;
    sourceUpdateTime: Date | null;
    createdAt: Date;
  }> = [];

  for (const [index, message] of record.messages.entries()) {
    rows.push({
      id: randomUUID(),
      seq: index + 1,
      role: message.role,
      messageType: `${CHAT_PREFIX}${message.type}`,
      content: message.content,
      attachmentsJson: JSON.stringify(message.attachments || []),
      partial: message.partial ? 1 : 0,
      sourceUpdateTime: message.updateTime ? new Date(message.updateTime) : null,
      createdAt: new Date(record.updatedAt),
    });
  }

  for (const [index, message] of record.websocketMessages.entries()) {
    rows.push({
      id: randomUUID(),
      seq: record.messages.length + index + 1,
      role: "system",
      messageType: `${WEBSOCKET_PREFIX}${message.type}`,
      content: JSON.stringify(message.data || {}),
      attachmentsJson: JSON.stringify([]),
      partial: message.data?.partial ? 1 : 0,
      sourceUpdateTime:
        typeof message.data?.updateTime === "number" ? new Date(message.data.updateTime) : null,
      createdAt: new Date(record.updatedAt),
    });
  }

  return rows;
};

export class MysqlConversationPersistenceProvider implements ConversationPersistenceProvider {
  private readonly cache = new Map<string, ConversationPersistenceRecord>();
  private initPromise: Promise<void> | null = null;
  private flushChain: Promise<void> = Promise.resolve();

  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.hydrate();
    }
    await this.initPromise;
  }

  exists(taskId: string): boolean {
    return this.cache.has(taskId);
  }

  load(taskId: string): ConversationPersistenceRecord | null {
    const record = this.cache.get(taskId);
    return record ? structuredClone(record) : null;
  }

  save(record: ConversationPersistenceRecord): boolean {
    this.cache.set(record.taskId, structuredClone(record));
    this.enqueueFlush(async () => {
      await this.persistRecord(record);
    });
    return true;
  }

  delete(taskId: string): boolean {
    const existed = this.cache.delete(taskId);
    this.enqueueFlush(async () => {
      await mysqlExecute("DELETE FROM conversations WHERE id = ?", [taskId]);
    });
    return existed;
  }

  listConversationRelations(): Array<{ taskId: string; fatherTaskId?: string }> {
    return Array.from(this.cache.values()).map((record) => ({
      taskId: record.taskId,
      ...(record.fatherTaskId ? { fatherTaskId: record.fatherTaskId } : {}),
    }));
  }

  listSessionHistories(
    userId?: string,
  ): Array<{ taskId: string; title: string; updatedAt: string }> {
    return Array.from(this.cache.values())
      .filter((record) => !record.fatherTaskId)
      .filter((record) => {
        if (!userId?.trim()) {
          return true;
        }
        return (
          record.context &&
          typeof record.context === "object" &&
          "userId" in record.context &&
          typeof (record.context as { userId?: unknown }).userId === "string" &&
          (record.context as { userId: string }).userId.trim() === userId.trim()
        );
      })
      .filter((record) => !shouldSkipAutomationTriggeredConversation(record.context))
      .map((record) => ({
        taskId: record.taskId,
        title: buildSessionTitle(record) || `Task ${record.taskId}`,
        updatedAt: record.updatedAt,
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  private enqueueFlush(task: () => Promise<void>): void {
    this.flushChain = this.flushChain.then(task).catch((error) => {
      logger.error(
        `[MysqlConversationPersistenceProvider] flush 失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  private async hydrate(): Promise<void> {
    await ensureMysqlSchemaUpToDate();

    const [conversationRows, stateRows, messageRows] = await Promise.all([
      mysqlQuery<ConversationRow>("SELECT * FROM conversations ORDER BY created_at ASC"),
      mysqlQuery<ConversationStateRow>("SELECT * FROM conversation_state"),
      mysqlQuery<ConversationMessageRow>(
        "SELECT * FROM conversation_messages ORDER BY conversation_id ASC, seq ASC",
      ),
    ]);

    const statesByConversationId = new Map(stateRows.map((row) => [row.conversation_id, row]));
    const messagesByConversationId = new Map<string, ConversationMessageRow[]>();
    for (const row of messageRows) {
      const rows = messagesByConversationId.get(row.conversation_id) || [];
      rows.push(row);
      messagesByConversationId.set(row.conversation_id, rows);
    }

    for (const row of conversationRows) {
      const state = statesByConversationId.get(row.id);
      const storedMessages = messagesByConversationId.get(row.id) || [];
      const messages: ConversationPersistenceRecord["messages"] = [];
      const websocketMessages: ConversationPersistenceRecord["websocketMessages"] = [];

      for (const messageRow of storedMessages) {
        if (messageRow.message_type.startsWith(CHAT_PREFIX)) {
          messages.push({
            role: messageRow.role as "user" | "assistant" | "system",
            type: messageRow.message_type.slice(CHAT_PREFIX.length) as
              | USER_SEND_MESSAGE_NAME
              | SERVER_SEND_MESSAGE_NAME
              | "think"
              | "interrupt"
              | "askFollowupQuestion"
              | "system"
              | "compaction",
            content: messageRow.content,
            attachments: parseJsonColumn(messageRow.attachments_json, []),
            partial: !!messageRow.partial,
            ...(parseUpdateTime(messageRow.source_update_time)
              ? { updateTime: parseUpdateTime(messageRow.source_update_time) }
              : {}),
          });
          continue;
        }

        if (messageRow.message_type.startsWith(WEBSOCKET_PREFIX)) {
          const data = parseJsonColumn<Record<string, unknown>>(messageRow.content, {});
          websocketMessages.push({
            type: messageRow.message_type.slice(
              WEBSOCKET_PREFIX.length,
            ) as PersistedWebSocketMessage["type"],
            data: {
              ...data,
              partial: !!messageRow.partial,
              ...(parseUpdateTime(messageRow.source_update_time)
                ? { updateTime: parseUpdateTime(messageRow.source_update_time) }
                : {}),
            } as PersistedWebSocketMessage["data"],
          });
        }
      }

      this.cache.set(row.id, {
        taskId: row.id,
        ...(row.parent_id ? { fatherTaskId: row.parent_id } : {}),
        conversationStatus: row.status as ConversationStatus,
        ...(state?.initial_system_prompt?.trim()
          ? { initialSystemPrompt: state.initial_system_prompt.trim() }
          : {}),
        toolNames: parseJsonColumn(state?.tool_names_json, []),
        context: parseJsonColumn(row.context_json, {}),
        autoApproveToolNames: parseJsonColumn(state?.auto_approve_tool_names_json, []),
        pendingToolCall: parseJsonColumn(state?.pending_tool_call_json, null),
        subTasks: parseJsonColumn(state?.subtasks_json, {}),
        contextUsage: parseJsonColumn(state?.context_usage_json, undefined),
        createdAt: parseDateTime(row.created_at, new Date(0).toISOString()),
        updatedAt: parseDateTime(row.updated_at, new Date(0).toISOString()),
        messages,
        websocketMessages,
      });
    }
  }

  private async persistRecord(record: ConversationPersistenceRecord): Promise<void> {
    const context = this.ensureContextUserId(record.context);
    const userId = await this.resolveUserId(context);
    const messageRows = buildMessageRows(record);
    const createdAt = new Date(record.createdAt);
    const updatedAt = new Date(record.updatedAt);
    const lastUpdateTime =
      record.websocketMessages.at(-1)?.data?.updateTime || record.messages.at(-1)?.updateTime;

    await mysqlTransaction(async (connection) => {
      await connection.execute(
        `
          INSERT INTO conversations (
            id, user_id, parent_id, type, status, context_json, created_at, updated_at, last_message_at
          ) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            user_id = VALUES(user_id),
            parent_id = VALUES(parent_id),
            type = VALUES(type),
            status = VALUES(status),
            context_json = VALUES(context_json),
            updated_at = VALUES(updated_at),
            last_message_at = VALUES(last_message_at)
        `,
        [
          record.taskId,
          userId,
          record.fatherTaskId || null,
          record.fatherTaskId ? "sub" : "main",
          record.conversationStatus,
          JSON.stringify(context || {}),
          createdAt,
          updatedAt,
          lastUpdateTime ? new Date(lastUpdateTime) : updatedAt,
        ],
      );

      await connection.execute(
        `
          INSERT INTO conversation_state (
            conversation_id, initial_system_prompt, tool_names_json, auto_approve_tool_names_json,
            pending_tool_call_json, subtasks_json, context_usage_json, created_at, updated_at
          ) VALUES (?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), ?, ?)
          ON DUPLICATE KEY UPDATE
            initial_system_prompt = VALUES(initial_system_prompt),
            tool_names_json = VALUES(tool_names_json),
            auto_approve_tool_names_json = VALUES(auto_approve_tool_names_json),
            pending_tool_call_json = VALUES(pending_tool_call_json),
            subtasks_json = VALUES(subtasks_json),
            context_usage_json = VALUES(context_usage_json),
            updated_at = VALUES(updated_at)
        `,
        [
          record.taskId,
          record.initialSystemPrompt?.trim() || null,
          JSON.stringify(record.toolNames || []),
          JSON.stringify(record.autoApproveToolNames || []),
          JSON.stringify(record.pendingToolCall),
          JSON.stringify(record.subTasks || {}),
          JSON.stringify(record.contextUsage || null),
          createdAt,
          updatedAt,
        ],
      );

      await connection.execute("DELETE FROM conversation_messages WHERE conversation_id = ?", [
        record.taskId,
      ]);
      for (const row of messageRows) {
        await connection.execute(
          `
            INSERT INTO conversation_messages (
              id, conversation_id, seq, role, message_type, content, attachments_json,
              partial, source_update_time, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?)
          `,
          [
            row.id,
            record.taskId,
            row.seq,
            row.role,
            row.messageType,
            row.content,
            row.attachmentsJson,
            row.partial,
            row.sourceUpdateTime,
            row.createdAt,
          ],
        );
      }
    });
  }

  private ensureContextUserId(context: unknown): unknown {
    if (isPlainObject(context) && typeof context.userId === "string" && context.userId.trim()) {
      return context;
    }
    return context;
  }

  private async resolveUserId(context: unknown): Promise<string> {
    if (isPlainObject(context) && typeof context.userId === "string" && context.userId.trim()) {
      return context.userId.trim();
    }
    throw new Error("Conversation context 缺少 userId，无法持久化到 MySQL。");
  }
}

export async function createMysqlConversationPersistenceProvider() {
  const provider = new MysqlConversationPersistenceProvider();
  await provider.init();
  return provider;
}

import { and, eq, gt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import type {
  ConversationContextSnapshotRecord,
  ConversationPersistenceRecord,
} from "../../../../backend/src/core/persistence/types";
import { formatMysqlDateTime, mysqlTransaction } from "./mysql";
import { buildMessageRows } from "./mysqlConversationPersistenceMapper";
import * as schema from "./schema";
import {
  conversationContextSnapshotsTable,
  conversationMessagesTable,
  conversationStateTable,
  conversationsTable,
} from "./schema";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export const hasPersistableUserId = (context: unknown): boolean =>
  isPlainObject(context) && typeof context.userId === "string" && context.userId.trim().length > 0;

export const resolvePersistedUserId = async (context: unknown): Promise<string> => {
  if (hasPersistableUserId(context)) {
    return context.userId.trim();
  }
  throw new Error("Conversation context 缺少 userId，无法持久化到 MySQL。");
};

export const persistConversationRecord = async (
  record: ConversationPersistenceRecord,
): Promise<void> => {
  const userId = await resolvePersistedUserId(record.context);
  const messageRows = buildMessageRows(record);
  const createdAt = formatMysqlDateTime(new Date(record.createdAt));
  const updatedAt = formatMysqlDateTime(new Date(record.updatedAt));
  const lastUpdateTime =
    record.websocketMessages.at(-1)?.data?.updateTime || record.messages.at(-1)?.updateTime;
  const lastMessageAt = lastUpdateTime ? formatMysqlDateTime(new Date(lastUpdateTime)) : updatedAt;
  const conversationMessageRows = messageRows.map((row) => ({
    id: row.id,
    conversationId: record.taskId,
    seq: row.seq,
    role: row.role,
    messageType: row.messageType,
    content: row.content,
    attachmentsJson: Array.isArray(row.attachmentsJson) ? row.attachmentsJson : [],
    partial: row.partial,
    sourceUpdateTime: row.sourceUpdateTime
      ? formatMysqlDateTime(new Date(row.sourceUpdateTime))
      : null,
    createdAt: formatMysqlDateTime(new Date(row.createdAt)),
  }));

  await mysqlTransaction(async (connection) => {
    const db = drizzle(connection, { schema, mode: "default" });

    await db
      .insert(conversationsTable)
      .values({
        id: record.taskId,
        userId,
        parentId: record.fatherTaskId || null,
        type: record.fatherTaskId ? "sub" : "main",
        status: record.conversationStatus,
        contextJson: isPlainObject(record.context) ? record.context : {},
        createdAt,
        updatedAt,
        lastMessageAt,
      })
      .onDuplicateKeyUpdate({
        set: {
          userId,
          parentId: record.fatherTaskId || null,
          type: record.fatherTaskId ? "sub" : "main",
          status: record.conversationStatus,
          contextJson: isPlainObject(record.context) ? record.context : {},
          updatedAt,
          lastMessageAt,
        },
      });

    await db
      .insert(conversationStateTable)
      .values({
        conversationId: record.taskId,
        initialSystemPrompt: record.initialSystemPrompt?.trim() || null,
        toolNamesJson: record.toolNames || [],
        modelConfigJson: isPlainObject(record.modelConfigSnapshot)
          ? record.modelConfigSnapshot
          : null,
        autoApproveToolNamesJson: record.autoApproveToolNames || [],
        pendingToolCallJson: record.pendingToolCall ?? null,
        executionTasksJson: isPlainObject(record.executionTasks) ? record.executionTasks : {},
        contextUsageJson: record.contextUsage ?? null,
        workflowStateJson: isPlainObject(record.workflowState) ? record.workflowState : null,
        createdAt,
        updatedAt,
      })
      .onDuplicateKeyUpdate({
        set: {
          initialSystemPrompt: record.initialSystemPrompt?.trim() || null,
          toolNamesJson: record.toolNames || [],
          modelConfigJson: isPlainObject(record.modelConfigSnapshot)
            ? record.modelConfigSnapshot
            : null,
          autoApproveToolNamesJson: record.autoApproveToolNames || [],
          pendingToolCallJson: record.pendingToolCall ?? null,
          executionTasksJson: isPlainObject(record.executionTasks) ? record.executionTasks : {},
          contextUsageJson: record.contextUsage ?? null,
          workflowStateJson: isPlainObject(record.workflowState) ? record.workflowState : null,
          updatedAt,
        },
      });

    if (conversationMessageRows.length > 0) {
      await db
        .insert(conversationMessagesTable)
        .values(conversationMessageRows)
        .onDuplicateKeyUpdate({
          set: {
            role: sql`values(${conversationMessagesTable.role})`,
            messageType: sql`values(${conversationMessagesTable.messageType})`,
            content: sql`values(${conversationMessagesTable.content})`,
            attachmentsJson: sql`values(${conversationMessagesTable.attachmentsJson})`,
            partial: sql`values(${conversationMessagesTable.partial})`,
            sourceUpdateTime: sql`values(${conversationMessagesTable.sourceUpdateTime})`,
            createdAt: sql`values(${conversationMessagesTable.createdAt})`,
          },
        });

      await db
        .delete(conversationMessagesTable)
        .where(
          and(
            eq(conversationMessagesTable.conversationId, record.taskId),
            gt(conversationMessagesTable.seq, conversationMessageRows.length),
          ),
        );
    } else {
      await db
        .delete(conversationMessagesTable)
        .where(eq(conversationMessagesTable.conversationId, record.taskId));
    }
  });
};

export const persistConversationContextSnapshot = async (
  record: ConversationContextSnapshotRecord,
): Promise<void> => {
  await mysqlTransaction(async (connection) => {
    const db = drizzle(connection, { schema, mode: "default" });
    await db
      .insert(conversationContextSnapshotsTable)
      .values({
        id: record.requestId,
        conversationId: record.conversationId,
        requestId: record.requestId,
        conversationType: record.conversationType || "unknown",
        model: record.model,
        provider: record.provider || "unknown",
        configId: record.configId || null,
        workflowPhase: record.workflowPhase || null,
        agentRole: record.agentRole || null,
        messageCount: record.messageCount,
        toolNamesJson: record.toolNames,
        optionsJson: isPlainObject(record.options) ? record.options : {},
        createdAt: formatMysqlDateTime(new Date(record.createdAt)),
      })
      .onDuplicateKeyUpdate({
        set: {
          conversationId: record.conversationId,
          conversationType: record.conversationType || "unknown",
          model: record.model,
          provider: record.provider || "unknown",
          configId: record.configId || null,
          workflowPhase: record.workflowPhase || null,
          agentRole: record.agentRole || null,
          messageCount: record.messageCount,
          toolNamesJson: record.toolNames,
          optionsJson: isPlainObject(record.options) ? record.options : {},
          createdAt: formatMysqlDateTime(new Date(record.createdAt)),
        },
      });
  });
};

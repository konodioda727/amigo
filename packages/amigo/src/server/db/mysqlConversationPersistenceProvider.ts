import { inspect } from "node:util";
import { logger } from "@amigo-llm/backend";
import { asc, eq } from "drizzle-orm";
import type {
  ConversationContextSnapshotRecord,
  ConversationPersistenceProvider,
  ConversationPersistenceRecord,
} from "../../../../backend/src/core/persistence/types";
import { getDrizzleDb } from "./drizzle";
import { ensureMysqlSchemaUpToDate } from "./mysql";
import {
  buildConversationPersistenceRecord,
  buildSessionTitle,
  shouldSkipAutomationTriggeredConversation,
} from "./mysqlConversationPersistenceMapper";
import {
  hasPersistableUserId,
  persistConversationContextSnapshot,
  persistConversationRecord,
} from "./mysqlConversationPersistenceWriter";
import { conversationMessagesTable, conversationStateTable, conversationsTable } from "./schema";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const extractKnownErrorDetails = (
  error: unknown,
  prefix = "error",
  details: Record<string, unknown> = {},
): Record<string, unknown> => {
  if (!isPlainObject(error)) {
    details[`${prefix}.value`] = error;
    return details;
  }

  const knownKeys = [
    "name",
    "message",
    "code",
    "errno",
    "sql",
    "sqlState",
    "sqlMessage",
    "query",
    "params",
    "stack",
  ] as const;

  for (const key of knownKeys) {
    if (key in error) {
      details[`${prefix}.${key}`] = error[key];
    }
  }

  if ("cause" in error && error.cause !== undefined) {
    extractKnownErrorDetails(error.cause, `${prefix}.cause`, details);
  }

  return details;
};

const formatFlushErrorSummary = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const inspectError = (error: unknown): string =>
  inspect(error, {
    depth: null,
    showHidden: true,
    getters: true,
  });

export class MysqlConversationPersistenceProvider implements ConversationPersistenceProvider {
  private static readonly FLUSH_DEBOUNCE_MS = 5_000;
  private readonly cache = new Map<string, ConversationPersistenceRecord>();
  private readonly pendingRecordFlushes = new Map<string, ConversationPersistenceRecord>();
  private readonly pendingFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
    if (!hasPersistableUserId(record.context)) {
      return true;
    }
    this.scheduleRecordFlush(record);
    return true;
  }

  recordModelContextSnapshot(record: ConversationContextSnapshotRecord): void {
    this.enqueueFlush(async () => {
      await persistConversationContextSnapshot(record);
    }, `contextSnapshot conversationId=${record.conversationId} requestId=${record.requestId}`);
  }

  delete(taskId: string): boolean {
    const existed = this.cache.delete(taskId);
    this.pendingRecordFlushes.delete(taskId);
    this.clearPendingFlushTimer(taskId);
    this.enqueueFlush(async () => {
      await ensureMysqlSchemaUpToDate();
      await getDrizzleDb().delete(conversationsTable).where(eq(conversationsTable.id, taskId));
    }, `delete taskId=${taskId}`);
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

  private enqueueFlush(task: () => Promise<void>, label = "unknown"): void {
    this.flushChain = this.flushChain.then(task).catch((error) => {
      logger.error(
        `[MysqlConversationPersistenceProvider] flush 失败 (${label}): ${formatFlushErrorSummary(error)}`,
      );
      logger.error(
        "[MysqlConversationPersistenceProvider] flush 错误详情:",
        extractKnownErrorDetails(error),
      );
      logger.error(
        `[MysqlConversationPersistenceProvider] flush 原始错误对象 (${label}): ${inspectError(error)}`,
      );
      if (error instanceof Error && "cause" in error && error.cause !== undefined) {
        logger.error(
          `[MysqlConversationPersistenceProvider] flush 原始 cause (${label}): ${inspectError(error.cause)}`,
        );
      }
    });
  }

  private scheduleRecordFlush(record: ConversationPersistenceRecord): void {
    const clonedRecord = structuredClone(record);
    this.pendingRecordFlushes.set(record.taskId, clonedRecord);
    this.clearPendingFlushTimer(record.taskId);
    const timer = setTimeout(() => {
      this.pendingFlushTimers.delete(record.taskId);
      this.enqueueFlush(async () => {
        const pendingRecord = this.pendingRecordFlushes.get(record.taskId);
        if (!pendingRecord) {
          return;
        }
        this.pendingRecordFlushes.delete(record.taskId);
        await persistConversationRecord(pendingRecord);
      }, `save taskId=${record.taskId}`);
    }, MysqlConversationPersistenceProvider.FLUSH_DEBOUNCE_MS);
    this.pendingFlushTimers.set(record.taskId, timer);
  }

  private clearPendingFlushTimer(taskId: string): void {
    const timer = this.pendingFlushTimers.get(taskId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    this.pendingFlushTimers.delete(taskId);
  }

  private async hydrate(): Promise<void> {
    await ensureMysqlSchemaUpToDate();
    const db = getDrizzleDb();

    const [conversationRows, stateRows, messageRows] = await Promise.all([
      db.select().from(conversationsTable).orderBy(asc(conversationsTable.createdAt)),
      db.select().from(conversationStateTable),
      db
        .select()
        .from(conversationMessagesTable)
        .orderBy(asc(conversationMessagesTable.conversationId), asc(conversationMessagesTable.seq)),
    ]);

    const statesByConversationId = new Map(stateRows.map((row) => [row.conversationId, row]));
    const messagesByConversationId = new Map<string, (typeof messageRows)[number][]>();
    for (const row of messageRows) {
      const rows = messagesByConversationId.get(row.conversationId) || [];
      rows.push(row);
      messagesByConversationId.set(row.conversationId, rows);
    }

    for (const row of conversationRows) {
      const state = statesByConversationId.get(row.id);
      const storedMessages = messagesByConversationId.get(row.id) || [];
      this.cache.set(
        row.id,
        buildConversationPersistenceRecord({
          row,
          state,
          storedMessages,
        }),
      );
    }
  }
}

export async function createMysqlConversationPersistenceProvider() {
  const provider = new MysqlConversationPersistenceProvider();
  await provider.init();
  return provider;
}

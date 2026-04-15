import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  ensureMysqlSchemaUpToDate,
  formatMysqlDateTime,
  getDrizzleDb,
  integrationSessionsTable,
  isMysqlConfigured,
  mysqlTransaction,
} from "../../db";
import * as schema from "../../db/schema";

interface FeishuSessionRecord {
  taskId: string;
  userId?: string;
  updatedAt: string;
}

type FeishuSessionState = Record<string, FeishuSessionRecord>;

export class FeishuSessionStore {
  private readonly filePath: string;
  private state: FeishuSessionState | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(cachePath: string) {
    this.filePath = path.join(cachePath, "feishu", "sessions.json");
  }

  async init(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = isMysqlConfigured()
      ? this.loadFromDatabase()
      : Promise.resolve().then(() => {
          this.loadFromFile();
        });
    await this.initPromise;
  }

  get(sessionKey: string): string | null {
    const state = this.requireState();
    return state[sessionKey]?.taskId || null;
  }

  set(sessionKey: string, taskId: string, userId?: string): void {
    const state = this.requireState();
    state[sessionKey] = {
      taskId,
      ...(userId ? { userId } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.state = state;
    void this.persist().catch(() => undefined);
  }

  delete(sessionKey: string): void {
    const state = this.requireState();
    if (!(sessionKey in state)) {
      return;
    }
    delete state[sessionKey];
    this.state = state;
    void this.persist().catch(() => undefined);
  }

  private requireState(): FeishuSessionState {
    if (!this.state) {
      if (isMysqlConfigured()) {
        throw new Error("FeishuSessionStore 尚未初始化，请先调用 init()");
      }
      this.state = this.loadFromFile();
    }
    return this.state;
  }

  private async loadFromDatabase(): Promise<void> {
    await ensureMysqlSchemaUpToDate();
    const rows = await getDrizzleDb()
      .select({
        sessionKey: integrationSessionsTable.sessionKey,
        conversationId: integrationSessionsTable.conversationId,
        userId: integrationSessionsTable.userId,
        updatedAt: integrationSessionsTable.updatedAt,
      })
      .from(integrationSessionsTable)
      .where(eq(integrationSessionsTable.provider, "feishu"));
    this.state = Object.fromEntries(
      rows
        .map(
          (row) =>
            [
              row.sessionKey,
              {
                taskId: row.conversationId || "",
                ...(row.userId ? { userId: row.userId } : {}),
                updatedAt: row.updatedAt,
              },
            ] as const,
        )
        .filter(([, record]) => !!record.taskId),
    );
  }

  private loadFromFile(): FeishuSessionState {
    if (this.state) {
      return this.state;
    }

    if (!existsSync(this.filePath)) {
      this.state = {};
      return this.state;
    }

    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf-8")) as FeishuSessionState;
      this.state = raw && typeof raw === "object" ? raw : {};
    } catch {
      this.state = {};
    }

    return this.state;
  }

  private async persist(): Promise<void> {
    const state = this.requireState();
    if (isMysqlConfigured()) {
      await ensureMysqlSchemaUpToDate();
      await mysqlTransaction(async (connection) => {
        const db = drizzle(connection, { schema, mode: "default" });
        await db
          .delete(integrationSessionsTable)
          .where(eq(integrationSessionsTable.provider, "feishu"));
        const rows = Object.entries(state)
          .filter(([, record]) => !!record.userId?.trim())
          .map(([sessionKey, record]) => ({
            id: randomUUID(),
            provider: "feishu",
            sessionKey,
            userId: record.userId!.trim(),
            conversationId: record.taskId || null,
            updatedAt: formatMysqlDateTime(new Date(record.updatedAt)),
            createdAt: formatMysqlDateTime(new Date(record.updatedAt)),
          }));
        if (rows.length > 0) {
          await db.insert(integrationSessionsTable).values(rows);
        }
      });
      return;
    }

    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf-8");
  }
}

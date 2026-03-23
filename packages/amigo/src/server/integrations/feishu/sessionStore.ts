import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import { ensureMysqlSchemaUpToDate, isMysqlConfigured, mysqlExecute, mysqlQuery } from "../../db";

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
    const rows = await mysqlQuery<
      RowDataPacket & {
        session_key: string;
        conversation_id: string | null;
        user_id: string;
        updated_at: string;
      }
    >(
      "SELECT session_key, conversation_id, user_id, updated_at FROM integration_sessions WHERE provider = 'feishu'",
    );
    this.state = Object.fromEntries(
      rows
        .map(
          (row) =>
            [
              row.session_key,
              {
                taskId: row.conversation_id || "",
                ...(row.user_id ? { userId: row.user_id } : {}),
                updatedAt: row.updated_at,
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
      await mysqlExecute("DELETE FROM integration_sessions WHERE provider = 'feishu'", []);
      for (const [sessionKey, record] of Object.entries(state)) {
        if (!record.userId?.trim()) {
          continue;
        }
        await mysqlExecute(
          `
            INSERT INTO integration_sessions (
              id, provider, session_key, user_id, conversation_id, updated_at
            ) VALUES (?, 'feishu', ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              user_id = VALUES(user_id),
              conversation_id = VALUES(conversation_id),
              updated_at = VALUES(updated_at)
          `,
          [randomUUID(), sessionKey, record.userId.trim(), record.taskId, record.updatedAt],
        );
      }
      return;
    }

    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf-8");
  }
}

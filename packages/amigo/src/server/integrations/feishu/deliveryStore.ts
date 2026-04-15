import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  ensureMysqlSchemaUpToDate,
  formatMysqlDateTime,
  getDrizzleDb,
  isMysqlConfigured,
  mysqlTransaction,
  outboundDeliveriesTable,
} from "../../db";
import * as schema from "../../db/schema";

interface DeliveryRecord {
  deliveredAt: string;
}

type DeliveryState = Record<string, DeliveryRecord>;

export class FeishuDeliveryStore {
  private readonly filePath: string;
  private state: DeliveryState | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(cachePath: string) {
    this.filePath = path.join(cachePath, "feishu", "deliveries.json");
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

  has(key: string): boolean {
    const state = this.requireState();
    return key in state;
  }

  set(key: string): void {
    const state = this.requireState();
    state[key] = {
      deliveredAt: new Date().toISOString(),
    };
    this.state = state;
    void this.persist().catch(() => undefined);
  }

  cleanup(maxAgeMs: number): void {
    const state = this.requireState();
    const now = Date.now();
    let changed = false;
    for (const [key, record] of Object.entries(state)) {
      const deliveredAt = new Date(record.deliveredAt).getTime();
      if (!Number.isFinite(deliveredAt) || now - deliveredAt > maxAgeMs) {
        delete state[key];
        changed = true;
      }
    }
    if (changed) {
      this.state = state;
      void this.persist().catch(() => undefined);
    }
  }

  private requireState(): DeliveryState {
    if (!this.state) {
      if (isMysqlConfigured()) {
        throw new Error("FeishuDeliveryStore 尚未初始化，请先调用 init()");
      }
      this.state = this.loadFromFile();
    }
    return this.state;
  }

  private async loadFromDatabase(): Promise<void> {
    await ensureMysqlSchemaUpToDate();
    const rows = await getDrizzleDb()
      .select({
        dedupeKey: outboundDeliveriesTable.dedupeKey,
        deliveredAt: outboundDeliveriesTable.deliveredAt,
      })
      .from(outboundDeliveriesTable)
      .where(eq(outboundDeliveriesTable.provider, "feishu"));
    this.state = Object.fromEntries(
      rows.map((row) => [
        row.dedupeKey,
        {
          deliveredAt: row.deliveredAt || new Date(0).toISOString(),
        },
      ]),
    );
  }

  private loadFromFile(): DeliveryState {
    if (this.state) {
      return this.state;
    }

    if (!existsSync(this.filePath)) {
      this.state = {};
      return this.state;
    }

    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf-8")) as DeliveryState;
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
          .delete(outboundDeliveriesTable)
          .where(eq(outboundDeliveriesTable.provider, "feishu"));
        const rows = Object.entries(state).map(([deliveryKey, record]) => ({
          id: randomUUID(),
          provider: "feishu",
          dedupeKey: deliveryKey,
          payloadJson: { deliveryKey },
          deliveredAt: formatMysqlDateTime(new Date(record.deliveredAt)),
          createdAt: formatMysqlDateTime(),
        }));
        if (rows.length > 0) {
          await db.insert(outboundDeliveriesTable).values(rows);
        }
      });
      return;
    }

    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf-8");
  }
}

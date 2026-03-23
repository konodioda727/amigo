import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import { ensureMysqlSchemaUpToDate, isMysqlConfigured, mysqlExecute, mysqlQuery } from "../../db";

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
    const rows = await mysqlQuery<RowDataPacket & { dedupe_key: string; delivered_at: string }>(
      "SELECT dedupe_key, delivered_at FROM outbound_deliveries WHERE provider = 'feishu'",
    );
    this.state = Object.fromEntries(
      rows.map((row) => [
        row.dedupe_key,
        {
          deliveredAt: row.delivered_at,
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
      await mysqlExecute("DELETE FROM outbound_deliveries WHERE provider = 'feishu'", []);
      for (const [deliveryKey, record] of Object.entries(state)) {
        await mysqlExecute(
          `
            INSERT INTO outbound_deliveries (id, provider, dedupe_key, payload_json, delivered_at)
            VALUES (?, 'feishu', ?, CAST(? AS JSON), ?)
            ON DUPLICATE KEY UPDATE
              delivered_at = VALUES(delivered_at)
          `,
          [randomUUID(), deliveryKey, JSON.stringify({ deliveryKey }), record.deliveredAt],
        );
      }
      return;
    }

    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf-8");
  }
}

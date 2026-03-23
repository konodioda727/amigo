import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

interface DeliveryRecord {
  deliveredAt: string;
}

type DeliveryState = Record<string, DeliveryRecord>;

export class FeishuDeliveryStore {
  private readonly filePath: string;
  private state: DeliveryState | null = null;

  constructor(cachePath: string) {
    this.filePath = path.join(cachePath, "feishu", "deliveries.json");
  }

  has(key: string): boolean {
    const state = this.load();
    return key in state;
  }

  set(key: string): void {
    const state = this.load();
    state[key] = {
      deliveredAt: new Date().toISOString(),
    };
    this.save(state);
  }

  cleanup(maxAgeMs: number): void {
    const state = this.load();
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
      this.save(state);
    }
  }

  private load(): DeliveryState {
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

  private save(state: DeliveryState): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf-8");
    this.state = state;
  }
}

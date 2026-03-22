import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

interface FeishuSessionRecord {
  taskId: string;
  updatedAt: string;
}

type FeishuSessionState = Record<string, FeishuSessionRecord>;

export class FeishuSessionStore {
  private readonly filePath: string;
  private state: FeishuSessionState | null = null;

  constructor(cachePath: string) {
    this.filePath = path.join(cachePath, "feishu", "sessions.json");
  }

  get(sessionKey: string): string | null {
    const state = this.load();
    return state[sessionKey]?.taskId || null;
  }

  set(sessionKey: string, taskId: string): void {
    const state = this.load();
    state[sessionKey] = {
      taskId,
      updatedAt: new Date().toISOString(),
    };
    this.save(state);
  }

  delete(sessionKey: string): void {
    const state = this.load();
    if (!(sessionKey in state)) {
      return;
    }
    delete state[sessionKey];
    this.save(state);
  }

  private load(): FeishuSessionState {
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

  private save(state: FeishuSessionState): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf-8");
    this.state = state;
  }
}

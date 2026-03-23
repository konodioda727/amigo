import { logger } from "@amigo-llm/backend";
import type { AutomationDefinition, AutomationStore } from "./automationStore";

const MAX_TIMER_DELAY_MS = 2_147_483_647;

export class AutomationScheduler {
  private timer?: ReturnType<typeof setTimeout>;
  private started = false;
  private readonly runningAutomationIds = new Set<string>();

  constructor(
    private readonly automationStore: AutomationStore,
    private readonly runAutomation: (automation: AutomationDefinition) => Promise<void>,
  ) {}

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    await this.reschedule();
  }

  async refreshSchedule(): Promise<void> {
    await this.reschedule();
  }

  stop(): void {
    this.started = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  async runNow(id: string): Promise<AutomationDefinition | null> {
    const automation = await this.automationStore.get(id);
    if (!automation) {
      return null;
    }

    await this.executeAutomation(automation);
    await this.reschedule();
    return this.automationStore.get(id);
  }

  private async tick(): Promise<void> {
    if (!this.started) {
      return;
    }

    try {
      const automations = await this.automationStore.list();
      const now = Date.now();
      const dueAutomations = automations.filter(
        (automation) =>
          automation.enabled &&
          typeof automation.nextRunAt === "string" &&
          new Date(automation.nextRunAt).getTime() <= now,
      );

      for (const automation of dueAutomations) {
        await this.executeAutomation(automation);
      }
    } finally {
      await this.reschedule();
    }
  }

  private async executeAutomation(automation: AutomationDefinition): Promise<void> {
    if (this.runningAutomationIds.has(automation.id)) {
      return;
    }

    this.runningAutomationIds.add(automation.id);
    try {
      await this.runAutomation(automation);
      await this.automationStore.markRun(automation.id, { runAt: new Date() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[AutomationScheduler] automation=${automation.id} 执行失败: ${message}`);
      await this.automationStore.markRun(automation.id, {
        runAt: new Date(),
        error: message,
      });
    } finally {
      this.runningAutomationIds.delete(automation.id);
    }
  }

  private async reschedule(): Promise<void> {
    if (!this.started) {
      return;
    }

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    const automations = await this.automationStore.list();
    const nextTimestamps = automations
      .filter((automation) => automation.enabled && automation.nextRunAt)
      .map((automation) => new Date(automation.nextRunAt as string).getTime())
      .filter((timestamp) => Number.isFinite(timestamp));

    if (nextTimestamps.length === 0) {
      return;
    }

    const nextRunAt = Math.min(...nextTimestamps);
    const delay = Math.max(0, Math.min(nextRunAt - Date.now(), MAX_TIMER_DELAY_MS));
    this.timer = setTimeout(() => {
      void this.tick();
    }, delay);
  }
}

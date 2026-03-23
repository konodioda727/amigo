import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const JsonObjectSchema = z.record(z.string(), z.unknown());

const IntervalScheduleSchema = z.object({
  type: z.literal("interval"),
  everyMinutes: z.number().int().positive(),
});

const OnceScheduleSchema = z.object({
  type: z.literal("once"),
  afterMinutes: z.number().int().positive(),
});

const DailyScheduleSchema = z.object({
  type: z.literal("daily"),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

const WeeklyScheduleSchema = z.object({
  type: z.literal("weekly"),
  weekday: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

export const AutomationScheduleSchema = z.discriminatedUnion("type", [
  IntervalScheduleSchema,
  OnceScheduleSchema,
  DailyScheduleSchema,
  WeeklyScheduleSchema,
]);

export const AutomationDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  prompt: z.string().min(1),
  skillIds: z.array(z.string().min(1)).optional(),
  context: JsonObjectSchema.optional(),
  schedule: AutomationScheduleSchema,
  enabled: z.boolean().default(true),
  lastRunAt: z.string().optional(),
  nextRunAt: z.string().optional(),
  lastError: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const AutomationUpsertSchema = AutomationDefinitionSchema.omit({
  createdAt: true,
  updatedAt: true,
  lastRunAt: true,
  nextRunAt: true,
  lastError: true,
}).extend({
  id: z.string().min(1).optional(),
});

export type AutomationSchedule = z.infer<typeof AutomationScheduleSchema>;
export type AutomationDefinition = z.infer<typeof AutomationDefinitionSchema>;
export type AutomationUpsertInput = z.infer<typeof AutomationUpsertSchema>;

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "automation";

const normalizeStringArray = (values: string[] | undefined): string[] | undefined => {
  const normalized = Array.from(
    new Set((values || []).map((value) => value.trim()).filter(Boolean)),
  );
  return normalized.length > 0 ? normalized : undefined;
};

const computeNextRunAt = (schedule: AutomationSchedule, now: Date): string => {
  if (schedule.type === "interval") {
    return new Date(now.getTime() + schedule.everyMinutes * 60_000).toISOString();
  }

  if (schedule.type === "once") {
    return new Date(now.getTime() + schedule.afterMinutes * 60_000).toISOString();
  }

  if (schedule.type === "daily") {
    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setHours(schedule.hour, schedule.minute, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next.toISOString();
  }

  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(schedule.hour, schedule.minute, 0, 0);
  const currentWeekday = next.getDay();
  let dayOffset = schedule.weekday - currentWeekday;
  if (dayOffset < 0 || (dayOffset === 0 && next.getTime() <= now.getTime())) {
    dayOffset += 7;
  }
  next.setDate(next.getDate() + dayOffset);
  return next.toISOString();
};

export class AutomationStore {
  private readonly automationsDir: string;
  private readonly knownSkillIds?: () => Promise<Set<string>>;

  constructor(cachePath: string, knownSkillIds?: () => Promise<Set<string>>) {
    this.automationsDir = path.join(cachePath, "automations");
    this.knownSkillIds = knownSkillIds;
  }

  async init(): Promise<void> {
    await mkdir(this.automationsDir, { recursive: true });
  }

  async list(): Promise<AutomationDefinition[]> {
    await this.init();
    const entries = await readdir(this.automationsDir, { withFileTypes: true });
    const automations = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => this.readFromFile(path.join(this.automationsDir, entry.name))),
    );
    return automations.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<AutomationDefinition | null> {
    try {
      return await this.readFromFile(this.getFilePath(id));
    } catch {
      return null;
    }
  }

  async upsert(input: AutomationUpsertInput): Promise<AutomationDefinition> {
    await this.init();
    await this.assertKnownSkills(input.skillIds);

    const now = new Date();
    const nowIso = now.toISOString();
    const normalizedId = (input.id?.trim() || slugify(input.name)).trim();
    const existing = await this.get(normalizedId);
    const enabled = input.enabled ?? true;

    const nextAutomation: AutomationDefinition = {
      id: normalizedId,
      name: input.name.trim(),
      prompt: input.prompt.trim(),
      ...(normalizeStringArray(input.skillIds)
        ? { skillIds: normalizeStringArray(input.skillIds) }
        : {}),
      ...(input.context ? { context: input.context } : {}),
      schedule: input.schedule,
      enabled,
      ...(enabled ? { nextRunAt: computeNextRunAt(input.schedule, now) } : {}),
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
      ...(existing?.lastRunAt ? { lastRunAt: existing.lastRunAt } : {}),
      ...(existing?.lastError ? { lastError: existing.lastError } : {}),
    };

    await writeFile(
      this.getFilePath(normalizedId),
      JSON.stringify(nextAutomation, null, 2),
      "utf-8",
    );
    return nextAutomation;
  }

  async remove(id: string): Promise<boolean> {
    try {
      await rm(this.getFilePath(id), { force: true });
      return true;
    } catch {
      return false;
    }
  }

  async markRun(
    id: string,
    result: { runAt?: Date; error?: string } = {},
  ): Promise<AutomationDefinition | null> {
    const automation = await this.get(id);
    if (!automation) {
      return null;
    }

    const runAt = result.runAt || new Date();
    const shouldRemainEnabled =
      automation.enabled && (result.error?.trim() ? true : automation.schedule.type !== "once");
    const nextAutomation: AutomationDefinition = {
      ...automation,
      lastRunAt: runAt.toISOString(),
      enabled: shouldRemainEnabled,
      nextRunAt: shouldRemainEnabled ? computeNextRunAt(automation.schedule, runAt) : undefined,
      lastError: result.error?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };

    await writeFile(this.getFilePath(id), JSON.stringify(nextAutomation, null, 2), "utf-8");
    return nextAutomation;
  }

  private async assertKnownSkills(skillIds: string[] | undefined): Promise<void> {
    const normalizedSkillIds = normalizeStringArray(skillIds);
    if (!normalizedSkillIds || !this.knownSkillIds) {
      return;
    }

    const knownSkillIds = await this.knownSkillIds();
    const missingSkillIds = normalizedSkillIds.filter((skillId) => !knownSkillIds.has(skillId));
    if (missingSkillIds.length > 0) {
      throw new Error(`automation 引用了不存在的 skills: ${missingSkillIds.join(", ")}`);
    }
  }

  private getFilePath(id: string): string {
    return path.join(this.automationsDir, `${id.trim()}.json`);
  }

  private async readFromFile(filePath: string): Promise<AutomationDefinition> {
    const raw = await readFile(filePath, "utf-8");
    return AutomationDefinitionSchema.parse(JSON.parse(raw));
  }
}

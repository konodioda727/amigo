import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  automationRunsTable,
  automationsTable,
  ensureMysqlSchemaUpToDate,
  formatMysqlDateTime,
  getDrizzleDb,
  isMysqlConfigured,
  listNotificationChannels,
  parseJsonColumn,
} from "../db";

const JsonObjectSchema = z.record(z.string(), z.unknown());

const CoercedPositiveIntSchema = z.coerce.number().int().positive();
const CoercedHourSchema = z.coerce.number().int().min(0).max(23);
const CoercedMinuteSchema = z.coerce.number().int().min(0).max(59);
const CoercedWeekdaySchema = z.coerce.number().int().min(0).max(6);

const IntervalScheduleSchema = z.object({
  type: z.literal("interval"),
  everyMinutes: CoercedPositiveIntSchema,
});

const OnceScheduleSchema = z.object({
  type: z.literal("once"),
  afterMinutes: CoercedPositiveIntSchema,
});

const DailyScheduleSchema = z.object({
  type: z.literal("daily"),
  hour: CoercedHourSchema,
  minute: CoercedMinuteSchema,
});

const WeeklyScheduleSchema = z.object({
  type: z.literal("weekly"),
  weekday: CoercedWeekdaySchema,
  hour: CoercedHourSchema,
  minute: CoercedMinuteSchema,
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const NOTIFICATION_AUTOMATION_PATTERN =
  /(提醒|提醒我|通知|闹钟|alert|remind|reminder|notify|notification)/i;

const isNotificationAutomation = (input: { prompt: string; context?: unknown }) => {
  if (NOTIFICATION_AUTOMATION_PATTERN.test(input.prompt)) {
    return true;
  }

  return isPlainObject(input.context) && input.context.trigger === "automation_notification";
};

type AutomationRow = typeof automationsTable.$inferSelect;

const parseDateTime = (value: unknown): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const raw = String(value).trim();
  if (!raw) {
    return undefined;
  }
  if (raw.includes("T")) {
    return new Date(raw).toISOString();
  }
  return new Date(`${raw.replace(" ", "T")}Z`).toISOString();
};

const toMysqlDateTime = (value: Date | string): string =>
  formatMysqlDateTime(typeof value === "string" ? new Date(value) : value);

const toMysqlDateTimeOrNull = (value: Date | string | null | undefined): string | null =>
  value ? toMysqlDateTime(value) : null;

const mapAutomationRow = (row: AutomationRow): AutomationDefinition => {
  const schedule = AutomationScheduleSchema.parse(
    parseJsonColumn<AutomationSchedule>(row.scheduleJson, {
      type: "interval",
      everyMinutes: 1,
    }),
  );
  const enabled = row.enabled === true || row.enabled === 1 || String(row.enabled) === "1";
  const skillIds = normalizeStringArray(
    parseJsonColumn<string[]>(row.skillIdsJson, []).map((value) => String(value)),
  );
  const context = parseJsonColumn<Record<string, unknown> | null>(row.contextJson, null);

  return AutomationDefinitionSchema.parse({
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    ...(skillIds ? { skillIds } : {}),
    ...(context ? { context } : {}),
    schedule,
    enabled,
    ...(parseDateTime(row.lastRunAt) ? { lastRunAt: parseDateTime(row.lastRunAt) } : {}),
    ...(parseDateTime(row.nextRunAt) ? { nextRunAt: parseDateTime(row.nextRunAt) } : {}),
    ...(row.lastError?.trim() ? { lastError: row.lastError.trim() } : {}),
    createdAt: parseDateTime(row.createdAt) || new Date(0).toISOString(),
    updatedAt: parseDateTime(row.updatedAt) || new Date(0).toISOString(),
  });
};

export class AutomationStore {
  private readonly automationsDir: string;
  private readonly knownSkillIds?: () => Promise<Set<string>>;

  constructor(cachePath: string, knownSkillIds?: () => Promise<Set<string>>) {
    this.automationsDir = path.join(cachePath, "automations");
    this.knownSkillIds = knownSkillIds;
  }

  async init(): Promise<void> {
    if (isMysqlConfigured()) {
      await ensureMysqlSchemaUpToDate();
      return;
    }

    await mkdir(this.automationsDir, { recursive: true });
  }

  async list(userId?: string): Promise<AutomationDefinition[]> {
    if (isMysqlConfigured()) {
      await this.init();
      const rows = await this.listAutomationRows(userId);
      return rows.map(mapAutomationRow);
    }

    await this.init();
    const entries = await readdir(this.automationsDir, { withFileTypes: true });
    const automations = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => this.readFromFile(path.join(this.automationsDir, entry.name))),
    );
    return automations.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string, userId?: string): Promise<AutomationDefinition | null> {
    if (isMysqlConfigured()) {
      await this.init();
      const row = await this.readAutomationRow(id, userId);
      return row ? mapAutomationRow(row) : null;
    }

    try {
      return await this.readFromFile(this.getFilePath(id));
    } catch {
      return null;
    }
  }

  async upsert(input: AutomationUpsertInput, userId?: string): Promise<AutomationDefinition> {
    await this.assertKnownSkills(input.skillIds);

    if (isMysqlConfigured()) {
      await this.init();
      const now = new Date();
      const nowIso = now.toISOString();
      const normalizedId = (input.id?.trim() || slugify(input.name)).trim();
      const resolvedUserId = this.resolveAutomationUserId(input.context, userId);
      const existing = await this.get(normalizedId, resolvedUserId);
      const enabled = input.enabled ?? true;
      await this.assertNotificationChannelsConfigured(resolvedUserId, input);
      const context =
        input.context && isPlainObject(input.context)
          ? { ...input.context, userId: resolvedUserId }
          : { userId: resolvedUserId };
      const skillIds = normalizeStringArray(input.skillIds);
      const nextRunAt = enabled ? computeNextRunAt(input.schedule, new Date(nowIso)) : null;

      const payload = {
        id: normalizedId,
        userId: resolvedUserId,
        name: input.name.trim(),
        prompt: input.prompt.trim(),
        skillIdsJson: skillIds || [],
        contextJson: context,
        scheduleType: input.schedule.type,
        scheduleJson: input.schedule,
        enabled: enabled ? 1 : 0,
        nextRunAt,
        lastRunAt: existing?.lastRunAt || null,
        lastError: existing?.lastError || null,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      await getDrizzleDb()
        .insert(automationsTable)
        .values({
          id: payload.id,
          userId: payload.userId,
          name: payload.name,
          prompt: payload.prompt,
          skillIdsJson: payload.skillIdsJson,
          contextJson: payload.contextJson,
          scheduleType: payload.scheduleType,
          scheduleJson: payload.scheduleJson,
          enabled: payload.enabled,
          nextRunAt: toMysqlDateTimeOrNull(payload.nextRunAt),
          lastRunAt: toMysqlDateTimeOrNull(payload.lastRunAt),
          lastError: payload.lastError,
          createdAt: toMysqlDateTime(payload.createdAt),
          updatedAt: toMysqlDateTime(payload.updatedAt),
        })
        .onDuplicateKeyUpdate({
          set: {
            userId: payload.userId,
            name: payload.name,
            prompt: payload.prompt,
            skillIdsJson: payload.skillIdsJson,
            contextJson: payload.contextJson,
            scheduleType: payload.scheduleType,
            scheduleJson: payload.scheduleJson,
            enabled: payload.enabled,
            nextRunAt: toMysqlDateTimeOrNull(payload.nextRunAt),
            lastRunAt: toMysqlDateTimeOrNull(payload.lastRunAt),
            lastError: payload.lastError,
            createdAt: toMysqlDateTime(payload.createdAt),
            updatedAt: toMysqlDateTime(payload.updatedAt),
          },
        });

      const saved = await this.get(normalizedId, resolvedUserId);
      if (!saved) {
        throw new Error(`automation 保存失败: ${normalizedId}`);
      }
      return saved;
    }

    await this.init();
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

  async remove(id: string, userId?: string): Promise<boolean> {
    if (isMysqlConfigured()) {
      await this.init();
      const existing = await this.get(id.trim(), userId);
      if (!existing) {
        return false;
      }
      await getDrizzleDb()
        .delete(automationsTable)
        .where(
          userId?.trim()
            ? and(eq(automationsTable.id, id.trim()), eq(automationsTable.userId, userId.trim()))
            : eq(automationsTable.id, id.trim()),
        );
      return true;
    }

    try {
      await rm(this.getFilePath(id), { force: true });
      return true;
    } catch {
      return false;
    }
  }

  async markRun(
    id: string,
    result: { runAt?: Date; error?: string; conversationId?: string; runId?: string } = {},
  ): Promise<AutomationDefinition | null> {
    if (isMysqlConfigured()) {
      await this.init();
      const automation = await this.get(id);
      if (!automation) {
        return null;
      }

      const runAt = result.runAt || new Date();
      const shouldRemainEnabled = automation.enabled && automation.schedule.type !== "once";
      await getDrizzleDb()
        .update(automationsTable)
        .set({
          enabled: shouldRemainEnabled ? 1 : 0,
          nextRunAt: shouldRemainEnabled
            ? toMysqlDateTime(computeNextRunAt(automation.schedule, runAt))
            : null,
          lastRunAt: toMysqlDateTime(runAt),
          lastError: result.error?.trim() || null,
          updatedAt: formatMysqlDateTime(),
        })
        .where(eq(automationsTable.id, id.trim()));

      const runId = result.runId?.trim() || randomUUID();
      await getDrizzleDb()
        .insert(automationRunsTable)
        .values({
          id: runId,
          automationId: id.trim(),
          conversationId: result.conversationId || null,
          status: result.error?.trim() ? "failed" : "completed",
          triggeredAt: toMysqlDateTime(runAt),
          startedAt: toMysqlDateTime(runAt),
          finishedAt: toMysqlDateTime(runAt),
          error: result.error?.trim() || null,
        })
        .onDuplicateKeyUpdate({
          set: {
            conversationId: result.conversationId || null,
            status: result.error?.trim() ? "failed" : "completed",
            finishedAt: toMysqlDateTime(runAt),
            error: result.error?.trim() || null,
          },
        });

      return this.get(id);
    }

    const automation = await this.get(id);
    if (!automation) {
      return null;
    }

    const runAt = result.runAt || new Date();
    const shouldRemainEnabled = automation.enabled && automation.schedule.type !== "once";
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

  private resolveAutomationUserId(context: unknown, fallbackUserId?: string): string {
    if (isPlainObject(context) && typeof context.userId === "string" && context.userId.trim()) {
      return context.userId.trim();
    }

    if (fallbackUserId?.trim()) {
      return fallbackUserId.trim();
    }

    throw new Error("automation 缺少 userId，无法确定归属用户。");
  }

  async startRun(id: string): Promise<string | null> {
    if (!isMysqlConfigured()) {
      return null;
    }

    await this.init();
    const runId = randomUUID();
    const now = new Date();
    await getDrizzleDb()
      .insert(automationRunsTable)
      .values({
        id: runId,
        automationId: id.trim(),
        status: "running",
        triggeredAt: toMysqlDateTime(now),
        startedAt: toMysqlDateTime(now),
        conversationId: null,
        finishedAt: null,
        error: null,
      });
    return runId;
  }

  private async assertNotificationChannelsConfigured(
    userId: string,
    input: Pick<AutomationUpsertInput, "prompt" | "context">,
  ): Promise<void> {
    if (!isMysqlConfigured() || !isNotificationAutomation(input)) {
      return;
    }

    const contextHasChannel =
      isPlainObject(input.context) &&
      isPlainObject(input.context.feishu) &&
      typeof input.context.feishu.chatId === "string" &&
      input.context.feishu.chatId.trim();
    if (contextHasChannel) {
      return;
    }

    const channels = await listNotificationChannels(userId, "feishu");
    if (channels.some((channel) => channel.enabled)) {
      return;
    }

    throw new Error("当前账号还没有可用的飞书通知通道，无法创建提醒型 automation。");
  }

  private getFilePath(id: string): string {
    return path.join(this.automationsDir, `${id.trim()}.json`);
  }

  private async listAutomationRows(userId?: string): Promise<AutomationRow[]> {
    const db = getDrizzleDb();
    return userId?.trim()
      ? db
          .select()
          .from(automationsTable)
          .where(eq(automationsTable.userId, userId.trim()))
          .orderBy(asc(automationsTable.name))
      : db.select().from(automationsTable).orderBy(asc(automationsTable.name));
  }

  private async readAutomationRow(id: string, userId?: string): Promise<AutomationRow | null> {
    const db = getDrizzleDb();
    const rows = await db
      .select()
      .from(automationsTable)
      .where(
        userId?.trim()
          ? and(eq(automationsTable.id, id.trim()), eq(automationsTable.userId, userId.trim()))
          : eq(automationsTable.id, id.trim()),
      )
      .limit(1);
    return rows[0] || null;
  }

  private async readFromFile(filePath: string): Promise<AutomationDefinition> {
    const raw = await readFile(filePath, "utf-8");
    return AutomationDefinitionSchema.parse(JSON.parse(raw));
  }
}

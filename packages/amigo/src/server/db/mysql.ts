import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { decryptSecret, encryptSecret } from "../utils/secretBox";
import { getDrizzleDb } from "./drizzle";
import {
  ensureDefaultLocalWebUser as bootstrapDefaultLocalWebUser,
  ensureAmigoMysqlSchema,
} from "./migrations";
import { createAmigoMysqlPool, readAmigoMysqlConfigFromEnv, withAmigoTransaction } from "./pool";
import {
  externalIdentitiesTable,
  notificationChannelsTable,
  tenantsTable,
  usersTable,
} from "./schema";

const APP_SETTINGS_KEY = "default";

interface AppSettingsRecord {
  integrations?: {
    feishu?: {
      appIdCiphertext?: string;
      appSecretCiphertext?: string;
    };
  };
}

export interface FeishuAppCredentialSummary {
  appIdConfigured: boolean;
  appSecretConfigured: boolean;
}

type AppSettingsRow = RowDataPacket & {
  settings_json: unknown;
};

export interface PersistedUser {
  id: string;
  tenantId: string;
  kind: "local_web" | "external";
  displayName: string;
  status: string;
  email?: string | null;
}

export interface NotificationChannelRecord {
  id: string;
  userId: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  isDefault: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

let pool: Pool | null = null;
let schemaReadyPromise: Promise<void> | null = null;
let localWebUserPromise: Promise<PersistedUser | null> | null = null;

const isDuplicateEntryError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("ER_DUP_ENTRY");

const parseDateTime = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const raw = String(value || "").trim();
  if (!raw) {
    return new Date(0).toISOString();
  }
  if (raw.includes("T")) {
    return new Date(raw).toISOString();
  }
  return new Date(`${raw.replace(" ", "T")}Z`).toISOString();
};

const buildExternalIdentityEmail = (provider: string, externalId: string): string => {
  const safeProvider = provider.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "external";
  const safeExternalId = externalId.toLowerCase().replace(/[^a-z0-9]+/g, "-") || randomUUID();
  return `${safeProvider}-${safeExternalId}@external.amigo.local`;
};

export const parseJsonColumn = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return fallback;
    }
    return JSON.parse(trimmed) as T;
  }
  if (Buffer.isBuffer(value)) {
    const text = value.toString("utf-8").trim();
    if (!text) {
      return fallback;
    }
    return JSON.parse(text) as T;
  }
  return value as T;
};

export const isMysqlConfigured = (): boolean => !!readAmigoMysqlConfigFromEnv();

export const requireMysqlConfigured = (): void => {
  if (isMysqlConfigured()) {
    return;
  }

  throw new Error(
    "MySQL is required. Set MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE.",
  );
};

export const getMysqlPool = (): Pool => {
  if (pool) {
    return pool;
  }

  const config = readAmigoMysqlConfigFromEnv();
  if (!config) {
    throw new Error("Missing MySQL configuration. Set MYSQL_HOST, MYSQL_USER, and MYSQL_DATABASE.");
  }

  pool = createAmigoMysqlPool(config);
  return pool;
};

export const mysqlQuery = async <T extends RowDataPacket>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> => {
  const [rows] = await getMysqlPool().query<T[]>(sql, params as never[]);
  return rows;
};

export const mysqlExecute = async (
  sql: string,
  params: unknown[] = [],
): Promise<ResultSetHeader> => {
  const [result] = await getMysqlPool().execute<ResultSetHeader>(sql, params as never[]);
  return result;
};

export const mysqlTransaction = async <T>(
  fn: (connection: PoolConnection) => Promise<T>,
): Promise<T> => withAmigoTransaction(getMysqlPool(), fn);

export const ensureMysqlSchemaUpToDate = async (): Promise<void> => {
  requireMysqlConfigured();

  if (!schemaReadyPromise) {
    schemaReadyPromise = ensureAmigoMysqlSchema(getMysqlPool()).then(() => undefined);
  }

  await schemaReadyPromise;
};

export const ensureDefaultLocalWebUser = async (): Promise<PersistedUser | null> => {
  requireMysqlConfigured();

  if (!localWebUserPromise) {
    localWebUserPromise = ensureMysqlSchemaUpToDate()
      .then(() => bootstrapDefaultLocalWebUser(getMysqlPool()))
      .then((result) => result.user);
  }

  return localWebUserPromise;
};

const readExternalIdentityUser = async (
  provider: string,
  externalId: string,
): Promise<PersistedUser | null> => {
  const db = getDrizzleDb();
  const rows = await db
    .select({
      id: usersTable.id,
      tenantId: usersTable.tenantId,
      kind: usersTable.kind,
      displayName: usersTable.displayName,
      status: usersTable.status,
      email: usersTable.email,
    })
    .from(externalIdentitiesTable)
    .innerJoin(usersTable, eq(usersTable.id, externalIdentitiesTable.userId))
    .where(
      and(
        eq(externalIdentitiesTable.provider, provider),
        eq(externalIdentitiesTable.externalId, externalId),
      ),
    )
    .limit(1);

  return rows[0]
    ? {
        id: rows[0].id,
        tenantId: rows[0].tenantId,
        kind: rows[0].kind as PersistedUser["kind"],
        displayName: rows[0].displayName,
        status: rows[0].status,
        email: rows[0].email,
      }
    : null;
};

export const findOrCreateExternalIdentityUser = async (input: {
  provider: string;
  externalId: string;
  displayName?: string;
  metadata?: Record<string, unknown>;
}): Promise<PersistedUser> => {
  await ensureMysqlSchemaUpToDate();

  const provider = input.provider.trim();
  const externalId = input.externalId.trim();
  if (!provider || !externalId) {
    throw new Error("provider 和 externalId 不能为空");
  }

  const existing = await readExternalIdentityUser(provider, externalId);
  if (existing) {
    return existing;
  }

  const tenantId = randomUUID();
  const userId = randomUUID();
  const displayName =
    (input.displayName || "").trim() || `${provider}:${externalId.slice(-8) || "user"}`;
  const email = buildExternalIdentityEmail(provider, externalId);
  const tenantSlug = `${provider}-${externalId}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 191);
  const tenantName = displayName;

  try {
    await mysqlTransaction(async () => {
      const db = getDrizzleDb();
      await db.insert(tenantsTable).values({
        id: tenantId,
        slug: tenantSlug || tenantId,
        name: tenantName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await db.insert(usersTable).values({
        id: userId,
        tenantId,
        kind: "external",
        displayName,
        email,
        emailVerified: 0,
        image: null,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await db.insert(externalIdentitiesTable).values({
        id: randomUUID(),
        userId,
        provider,
        externalId,
        metadataJson: input.metadata || {},
        createdAt: new Date().toISOString(),
      });
    });
  } catch (error) {
    if (!isDuplicateEntryError(error)) {
      throw error;
    }
  }

  const created = await readExternalIdentityUser(provider, externalId);
  if (!created) {
    throw new Error("创建 external identity user 失败");
  }
  return created;
};

export const listNotificationChannels = async (
  userId: string,
  type?: string,
): Promise<NotificationChannelRecord[]> => {
  await ensureMysqlSchemaUpToDate();
  const db = getDrizzleDb();
  const rows = await db
    .select()
    .from(notificationChannelsTable)
    .where(
      type
        ? and(
            eq(notificationChannelsTable.userId, userId),
            eq(notificationChannelsTable.type, type),
          )
        : eq(notificationChannelsTable.userId, userId),
    )
    .orderBy(desc(notificationChannelsTable.isDefault), desc(notificationChannelsTable.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    type: row.type,
    name: row.name,
    config: parseJsonColumn<Record<string, unknown>>(row.configJson, {}),
    isDefault: row.isDefault === 1 || String(row.isDefault) === "1",
    enabled: row.enabled === 1 || String(row.enabled) === "1",
    createdAt: parseDateTime(row.createdAt),
    updatedAt: parseDateTime(row.updatedAt),
  }));
};

export const upsertNotificationChannel = async (input: {
  userId: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  isDefault?: boolean;
  enabled?: boolean;
}): Promise<void> => {
  await ensureMysqlSchemaUpToDate();

  await mysqlTransaction(async () => {
    const db = getDrizzleDb();
    if (input.isDefault) {
      await db
        .update(notificationChannelsTable)
        .set({ isDefault: 0, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(notificationChannelsTable.userId, input.userId),
            eq(notificationChannelsTable.type, input.type),
          ),
        );
    }

    const existing = await db
      .select({ id: notificationChannelsTable.id })
      .from(notificationChannelsTable)
      .where(
        and(
          eq(notificationChannelsTable.userId, input.userId),
          eq(notificationChannelsTable.type, input.type),
          eq(notificationChannelsTable.name, input.name),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(notificationChannelsTable)
        .set({
          configJson: input.config,
          isDefault: input.isDefault ? 1 : 0,
          enabled: input.enabled === false ? 0 : 1,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(notificationChannelsTable.id, existing[0].id));
      return;
    }

    await db.insert(notificationChannelsTable).values({
      id: randomUUID(),
      userId: input.userId,
      type: input.type,
      name: input.name,
      configJson: input.config,
      isDefault: input.isDefault ? 1 : 0,
      enabled: input.enabled === false ? 0 : 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });
};

export const updateNotificationChannels = async (
  userId: string,
  updates: Array<{
    id: string;
    enabled: boolean;
    isDefault: boolean;
  }>,
): Promise<NotificationChannelRecord[]> => {
  await ensureMysqlSchemaUpToDate();

  const existing = await listNotificationChannels(userId);
  const existingMap = new Map(existing.map((channel) => [channel.id, channel]));
  const updateMap = new Map(
    updates.map((update) => [
      update.id.trim(),
      { enabled: update.enabled, isDefault: update.isDefault },
    ]),
  );

  for (const channelId of updateMap.keys()) {
    if (!existingMap.has(channelId)) {
      throw new Error(`notification channel 不存在: ${channelId}`);
    }
  }

  const merged = existing.map((channel) => {
    const next = updateMap.get(channel.id);
    return {
      ...channel,
      enabled: next?.enabled ?? channel.enabled,
      isDefault: next?.isDefault ?? channel.isDefault,
    };
  });

  const channelTypes = new Set(merged.map((channel) => channel.type));
  for (const type of channelTypes) {
    const channels = merged.filter((channel) => channel.type === type);
    for (const channel of channels) {
      if (!channel.enabled) {
        channel.isDefault = false;
      }
    }

    const defaultChannel = channels.find((channel) => channel.enabled && channel.isDefault);
    const fallbackDefaultChannel =
      defaultChannel || channels.find((channel) => channel.enabled) || null;

    for (const channel of channels) {
      channel.isDefault = fallbackDefaultChannel ? channel.id === fallbackDefaultChannel.id : false;
    }
  }

  for (const channel of merged) {
    const previous = existingMap.get(channel.id);
    if (!previous) {
      continue;
    }
    if (previous.enabled === channel.enabled && previous.isDefault === channel.isDefault) {
      continue;
    }

    await mysqlExecute(
      `
        UPDATE notification_channels
        SET enabled = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP(3)
        WHERE id = ? AND user_id = ?
      `,
      [channel.enabled ? 1 : 0, channel.isDefault ? 1 : 0, channel.id, userId],
    );
  }

  return listNotificationChannels(userId);
};

const readAppSettings = async (): Promise<AppSettingsRecord> => {
  await ensureMysqlSchemaUpToDate();
  const rows = await mysqlQuery<AppSettingsRow>(
    "SELECT settings_json FROM app_settings WHERE `key` = ? LIMIT 1",
    [APP_SETTINGS_KEY],
  );
  return parseJsonColumn<AppSettingsRecord>(rows[0]?.settings_json, {});
};

const writeAppSettings = async (settings: AppSettingsRecord): Promise<void> => {
  await ensureMysqlSchemaUpToDate();
  await mysqlExecute(
    `
      INSERT INTO app_settings (\`key\`, settings_json, created_at, updated_at)
      VALUES (?, CAST(? AS JSON), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE
        settings_json = VALUES(settings_json),
        updated_at = CURRENT_TIMESTAMP(3)
    `,
    [APP_SETTINGS_KEY, JSON.stringify(settings)],
  );
};

const readEnvFeishuCredentials = () => {
  const appId = (process.env.FEISHU_APP_ID || "").trim();
  const appSecret = (process.env.FEISHU_APP_SECRET || "").trim();
  return appId && appSecret ? { appId, appSecret } : null;
};

export const getFeishuAppCredentialSummary = async (): Promise<FeishuAppCredentialSummary> => {
  const settings = await readAppSettings();
  const feishu = settings.integrations?.feishu;
  if (feishu?.appIdCiphertext && feishu?.appSecretCiphertext) {
    return {
      appIdConfigured: true,
      appSecretConfigured: true,
    };
  }

  const envCredentials = readEnvFeishuCredentials();
  return {
    appIdConfigured: !!envCredentials?.appId,
    appSecretConfigured: !!envCredentials?.appSecret,
  };
};

export const getFeishuAppCredentials = async (): Promise<{
  appId: string;
  appSecret: string;
} | null> => {
  const settings = await readAppSettings();
  const feishu = settings.integrations?.feishu;
  if (feishu?.appIdCiphertext && feishu?.appSecretCiphertext) {
    return {
      appId: decryptSecret(feishu.appIdCiphertext),
      appSecret: decryptSecret(feishu.appSecretCiphertext),
    };
  }

  return readEnvFeishuCredentials();
};

export const upsertFeishuAppCredentials = async (input: {
  appId?: string;
  appSecret?: string;
}): Promise<FeishuAppCredentialSummary> => {
  const settings = await readAppSettings();
  const current = await getFeishuAppCredentials();
  const nextAppId = (input.appId || "").trim() || current?.appId || "";
  const nextAppSecret = (input.appSecret || "").trim() || current?.appSecret || "";

  if ((nextAppId && !nextAppSecret) || (!nextAppId && nextAppSecret)) {
    throw new Error("飞书 AK/SK 需要成对配置");
  }

  const nextSettings: AppSettingsRecord = {
    ...settings,
    integrations: {
      ...(settings.integrations || {}),
      feishu: nextAppId
        ? {
            appIdCiphertext: encryptSecret(nextAppId),
            appSecretCiphertext: encryptSecret(nextAppSecret),
          }
        : {},
    },
  };

  await writeAppSettings(nextSettings);
  return {
    appIdConfigured: !!nextAppId,
    appSecretConfigured: !!nextAppSecret,
  };
};

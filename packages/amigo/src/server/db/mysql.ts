import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { decryptSecret, encryptSecret } from "../utils/secretBox";
import { getDrizzleDb } from "./drizzle";
import {
  ensureDefaultLocalWebUser as bootstrapDefaultLocalWebUser,
  ensureAmigoMysqlSchema,
} from "./migrations";
import { createAmigoMysqlPool, readAmigoMysqlConfigFromEnv, withAmigoTransaction } from "./pool";
import * as schema from "./schema";
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

interface FeishuChannelOwnerLookupInput {
  chatId: string;
  tenantKey?: string;
}

let pool: Pool | null = null;
let schemaReadyPromise: Promise<void> | null = null;
let localWebUserPromise: Promise<PersistedUser | null> | null = null;

type AmigoDatabase = MySql2Database<typeof schema>;

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

const buildExternalIdentityTenantSlug = (provider: string, externalId: string): string =>
  `${provider}-${externalId}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 191);

const createDrizzleDbForConnection = (connection: PoolConnection): AmigoDatabase =>
  drizzle(connection, { schema, mode: "default" });

export const formatMysqlDateTime = (value: Date = new Date()): string =>
  value.toISOString().slice(0, 23).replace("T", " ");

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

export const findPreferredLocalWebUser = async (): Promise<PersistedUser | null> => {
  await ensureMysqlSchemaUpToDate();

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
    .from(usersTable)
    .where(eq(usersTable.kind, "local_web"))
    .limit(10);

  if (rows.length === 0) {
    return null;
  }

  const preferredRows =
    rows.filter((row) => typeof row.email === "string" && row.email.trim()) || [];
  const selectedRow =
    preferredRows.length === 1 ? preferredRows[0] : rows.length === 1 ? rows[0] : null;

  if (!selectedRow) {
    return null;
  }

  return {
    id: selectedRow.id,
    tenantId: selectedRow.tenantId,
    kind: selectedRow.kind as PersistedUser["kind"],
    displayName: selectedRow.displayName,
    status: selectedRow.status,
    email: selectedRow.email,
  };
};

export const findFeishuChannelOwnerUserId = async (
  input: FeishuChannelOwnerLookupInput,
): Promise<string | null> => {
  await ensureMysqlSchemaUpToDate();

  const chatId = input.chatId.trim();
  if (!chatId) {
    return null;
  }

  const tenantKey = input.tenantKey?.trim() || "";
  const rows = await mysqlQuery<
    RowDataPacket & {
      userId: string;
    }
  >(
    tenantKey
      ? `
          SELECT nc.user_id AS userId
          FROM notification_channels nc
          INNER JOIN users u ON u.id = nc.user_id
          WHERE nc.type = 'feishu'
            AND nc.enabled = 1
            AND u.kind = 'local_web'
            AND JSON_UNQUOTE(JSON_EXTRACT(nc.config_json, '$.chatId')) = ?
            AND JSON_UNQUOTE(JSON_EXTRACT(nc.config_json, '$.tenantKey')) = ?
          ORDER BY nc.is_default DESC, nc.updated_at DESC
          LIMIT 1
        `
      : `
          SELECT nc.user_id AS userId
          FROM notification_channels nc
          INNER JOIN users u ON u.id = nc.user_id
          WHERE nc.type = 'feishu'
            AND nc.enabled = 1
            AND u.kind = 'local_web'
            AND JSON_UNQUOTE(JSON_EXTRACT(nc.config_json, '$.chatId')) = ?
          ORDER BY nc.is_default DESC, nc.updated_at DESC
          LIMIT 1
        `,
    tenantKey ? [chatId, tenantKey] : [chatId],
  );

  return rows[0]?.userId?.trim() || null;
};

const readExternalIdentityUserWithDb = async (
  db: AmigoDatabase,
  provider: string,
  externalId: string,
): Promise<PersistedUser | null> => {
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

const readExternalIdentityUser = async (
  provider: string,
  externalId: string,
): Promise<PersistedUser | null> => {
  return readExternalIdentityUserWithDb(getDrizzleDb(), provider, externalId);
};

const readUserByEmailWithDb = async (
  db: AmigoDatabase,
  email: string,
): Promise<PersistedUser | null> => {
  const rows = await db
    .select({
      id: usersTable.id,
      tenantId: usersTable.tenantId,
      kind: usersTable.kind,
      displayName: usersTable.displayName,
      status: usersTable.status,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(eq(usersTable.email, email))
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

const readTenantBySlugWithDb = async (
  db: AmigoDatabase,
  slug: string,
): Promise<{ id: string; slug: string; name: string } | null> => {
  const rows = await db
    .select({
      id: tenantsTable.id,
      slug: tenantsTable.slug,
      name: tenantsTable.name,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug))
    .limit(1);

  return rows[0] || null;
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
  const tenantSlug = buildExternalIdentityTenantSlug(provider, externalId);
  const tenantName = displayName;

  try {
    await mysqlTransaction(async (connection) => {
      const db = createDrizzleDbForConnection(connection);
      const existingUser = await readExternalIdentityUserWithDb(db, provider, externalId);
      if (existingUser) {
        return;
      }

      const now = formatMysqlDateTime();
      const tenant =
        (tenantSlug && (await readTenantBySlugWithDb(db, tenantSlug))) ||
        ({
          id: tenantId,
          slug: tenantSlug || tenantId,
          name: tenantName,
        } as const);

      if (!(await readTenantBySlugWithDb(db, tenant.slug))) {
        await db.insert(tenantsTable).values({
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          createdAt: now,
          updatedAt: now,
        });
      }

      const user =
        (await readUserByEmailWithDb(db, email)) ||
        ({
          id: userId,
          tenantId: tenant.id,
          kind: "external",
          displayName,
          status: "active",
          email,
        } as const);

      if (!(await readUserByEmailWithDb(db, email))) {
        await db.insert(usersTable).values({
          id: user.id,
          tenantId: user.tenantId,
          kind: "external",
          displayName,
          email,
          emailVerified: 0,
          image: null,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
      }

      await db.insert(externalIdentitiesTable).values({
        id: randomUUID(),
        userId: user.id,
        provider,
        externalId,
        metadataJson: input.metadata || {},
        createdAt: now,
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

  await mysqlTransaction(async (connection) => {
    const db = createDrizzleDbForConnection(connection);
    if (input.isDefault) {
      await db
        .update(notificationChannelsTable)
        .set({ isDefault: 0, updatedAt: formatMysqlDateTime() })
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
          updatedAt: formatMysqlDateTime(),
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
      createdAt: formatMysqlDateTime(),
      updatedAt: formatMysqlDateTime(),
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

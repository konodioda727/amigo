import { createPool, type Pool, type PoolConnection } from "mysql2/promise";
import type { AmigoMysqlConfig } from "./types";

const DEFAULT_CONNECTION_LIMIT = 10;

const parseBooleanEnv = (value: string | undefined): boolean | undefined => {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
};

const parsePositiveInteger = (value: string | undefined): number | undefined => {
  const parsed = Number.parseInt((value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

export const readAmigoMysqlConfigFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): AmigoMysqlConfig | null => {
  const host = (env.MYSQL_HOST || "").trim();
  const user = (env.MYSQL_USER || "").trim();
  const database = (env.MYSQL_DATABASE || "").trim();
  const ssl = parseBooleanEnv(env.MYSQL_SSL);

  if (!host || !user || !database) {
    return null;
  }

  return {
    host,
    port: parsePositiveInteger(env.MYSQL_PORT) || 3306,
    user,
    password: env.MYSQL_PASSWORD || "",
    database,
    ...(ssl !== undefined ? { ssl } : {}),
  };
};

export const requireAmigoMysqlConfigFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): AmigoMysqlConfig => {
  const config = readAmigoMysqlConfigFromEnv(env);
  if (!config) {
    throw new Error(
      "Missing MySQL configuration. Set MYSQL_HOST, MYSQL_USER, and MYSQL_DATABASE to enable the amigo DB layer.",
    );
  }
  return config;
};

export const createAmigoMysqlPool = (config: AmigoMysqlConfig): Pool =>
  createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: config.connectionLimit || DEFAULT_CONNECTION_LIMIT,
    waitForConnections: true,
    namedPlaceholders: true,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements: false,
    timezone: "Z",
    ...(config.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

export async function withAmigoTransaction<T>(
  pool: Pool,
  fn: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

export async function fetchRow<T extends object>(
  connectionOrPool: Pool | PoolConnection,
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const [rows] = await connectionOrPool.execute(sql, params as never[]);
  return ((rows as T[]) || [])[0] || null;
}

export async function fetchRows<T extends object>(
  connectionOrPool: Pool | PoolConnection,
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const [rows] = await connectionOrPool.execute(sql, params as never[]);
  return (rows as T[]) || [];
}

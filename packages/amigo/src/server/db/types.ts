import type { Pool, PoolConnection } from "mysql2/promise";

export interface AmigoMysqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
  connectionLimit?: number;
}

export interface MigrationDefinition {
  version: number;
  name: string;
  checksum: string;
  statements: string[];
}

export interface MigrationRecord {
  version: number;
  name: string;
  checksum: string;
  appliedAt: string;
}

export interface MigrationRunSummary {
  applied: Array<Pick<MigrationDefinition, "version" | "name">>;
  skipped: Array<Pick<MigrationDefinition, "version" | "name">>;
}

export interface LocalWebBootstrapOptions {
  tenantSlug?: string;
  tenantName?: string;
  userDisplayName?: string;
}

export interface LocalWebBootstrapResult {
  tenant: {
    id: string;
    slug: string;
    name: string;
  };
  user: {
    id: string;
    tenantId: string;
    kind: "local_web";
    displayName: string;
    status: string;
  };
  createdTenant: boolean;
  createdUser: boolean;
}

export interface AmigoMysqlDatabase {
  pool: Pool;
  migrate(): Promise<MigrationRunSummary>;
  bootstrapDefaultLocalWebUser(
    options?: LocalWebBootstrapOptions,
  ): Promise<LocalWebBootstrapResult>;
  close(): Promise<void>;
}

export type AmigoMysqlConnection = PoolConnection;

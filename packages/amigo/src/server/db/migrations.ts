import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolConnection } from "mysql2/promise";
import { fetchRow, withAmigoTransaction } from "./pool";
import type {
  LocalWebBootstrapOptions,
  LocalWebBootstrapResult,
  MigrationDefinition,
  MigrationRecord,
  MigrationRunSummary,
} from "./types";

const schemaMigrationsTableSql = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const initialMigrationStatements = [
  `
CREATE TABLE IF NOT EXISTS tenants (
  id CHAR(36) NOT NULL,
  slug VARCHAR(191) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenants_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  tenant_id CHAR(36) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_tenant_id (tenant_id),
  KEY idx_users_kind_status (kind, status),
  CONSTRAINT fk_users_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
CREATE TABLE IF NOT EXISTS external_identities (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  external_id VARCHAR(191) NOT NULL,
  metadata_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_external_identities_provider_external_id (provider, external_id),
  KEY idx_external_identities_user_id (user_id),
  CONSTRAINT fk_external_identities_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
CREATE TABLE IF NOT EXISTS notification_channels (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  type VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  config_json JSON NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_notification_channels_user_type_name (user_id, type, name),
  KEY idx_notification_channels_user_enabled_default (user_id, enabled, is_default),
  CONSTRAINT fk_notification_channels_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
CREATE TABLE IF NOT EXISTS conversations (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  parent_id CHAR(36) NULL,
  type VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  context_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  last_message_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_conversations_user_created_at (user_id, created_at),
  KEY idx_conversations_parent_id (parent_id),
  CONSTRAINT fk_conversations_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversations_parent_id FOREIGN KEY (parent_id) REFERENCES conversations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
CREATE TABLE IF NOT EXISTS conversation_messages (
  id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NOT NULL,
  seq BIGINT UNSIGNED NOT NULL,
  role VARCHAR(32) NOT NULL,
  message_type VARCHAR(32) NOT NULL,
  content LONGTEXT NOT NULL,
  attachments_json JSON NOT NULL,
  partial TINYINT(1) NOT NULL DEFAULT 0,
  source_update_time DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_conversation_messages_conversation_seq (conversation_id, seq),
  KEY idx_conversation_messages_conversation_created_at (conversation_id, created_at),
  CONSTRAINT fk_conversation_messages_conversation_id FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
CREATE TABLE IF NOT EXISTS conversation_state (
  conversation_id CHAR(36) NOT NULL,
  tool_names_json JSON NOT NULL,
  auto_approve_tool_names_json JSON NOT NULL,
  pending_tool_call_json JSON NULL,
  subtasks_json JSON NOT NULL,
  context_usage_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (conversation_id),
  CONSTRAINT fk_conversation_state_conversation_id FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
CREATE TABLE IF NOT EXISTS automations (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  prompt LONGTEXT NOT NULL,
  skill_ids_json JSON NOT NULL,
  context_json JSON NOT NULL,
  schedule_type VARCHAR(32) NOT NULL,
  schedule_json JSON NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  next_run_at DATETIME(3) NULL,
  last_run_at DATETIME(3) NULL,
  last_error LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_automations_user_enabled_next_run (user_id, enabled, next_run_at),
  UNIQUE KEY uq_automations_user_name (user_id, name),
  CONSTRAINT fk_automations_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
CREATE TABLE IF NOT EXISTS automation_runs (
  id CHAR(36) NOT NULL,
  automation_id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NULL,
  status VARCHAR(32) NOT NULL,
  triggered_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  started_at DATETIME(3) NULL,
  finished_at DATETIME(3) NULL,
  error LONGTEXT NULL,
  PRIMARY KEY (id),
  KEY idx_automation_runs_automation_triggered_at (automation_id, triggered_at),
  KEY idx_automation_runs_status (status),
  CONSTRAINT fk_automation_runs_automation_id FOREIGN KEY (automation_id) REFERENCES automations (id) ON DELETE CASCADE,
  CONSTRAINT fk_automation_runs_conversation_id FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
CREATE TABLE IF NOT EXISTS documents (
  id CHAR(36) NOT NULL,
  owner_conversation_id CHAR(36) NULL,
  user_id CHAR(36) NOT NULL,
  doc_scope VARCHAR(32) NOT NULL,
  doc_key VARCHAR(255) NOT NULL,
  format VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content_text LONGTEXT NULL,
  content_json JSON NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_documents_user_scope_key (user_id, doc_scope, doc_key),
  KEY idx_documents_owner_conversation_id (owner_conversation_id),
  CONSTRAINT fk_documents_owner_conversation_id FOREIGN KEY (owner_conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT fk_documents_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
CREATE TABLE IF NOT EXISTS design_assets (
  id CHAR(36) NOT NULL,
  owner_conversation_id CHAR(36) NULL,
  user_id CHAR(36) NOT NULL,
  asset_key VARCHAR(255) NOT NULL,
  metadata_json JSON NOT NULL,
  content_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_design_assets_user_asset_key (user_id, asset_key),
  KEY idx_design_assets_owner_conversation_id (owner_conversation_id),
  CONSTRAINT fk_design_assets_owner_conversation_id FOREIGN KEY (owner_conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT fk_design_assets_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
CREATE TABLE IF NOT EXISTS skills (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  skill_markdown LONGTEXT NOT NULL,
  resource_manifest_json JSON NOT NULL,
  path VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_skills_user_name (user_id, name),
  KEY idx_skills_user_id (user_id),
  CONSTRAINT fk_skills_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
CREATE TABLE IF NOT EXISTS skill_files (
  skill_id CHAR(36) NOT NULL,
  relative_path VARCHAR(512) NOT NULL,
  content_text LONGTEXT NULL,
  content_blob LONGBLOB NULL,
  mode INT NOT NULL DEFAULT 420,
  mime_type VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (skill_id, relative_path),
  KEY idx_skill_files_skill_id (skill_id),
  CONSTRAINT fk_skill_files_skill_id FOREIGN KEY (skill_id) REFERENCES skills (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
CREATE TABLE IF NOT EXISTS integration_sessions (
  id CHAR(36) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  session_key VARCHAR(255) NOT NULL,
  user_id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_integration_sessions_provider_session_key (provider, session_key),
  KEY idx_integration_sessions_user_id (user_id),
  KEY idx_integration_sessions_conversation_id (conversation_id),
  CONSTRAINT fk_integration_sessions_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_integration_sessions_conversation_id FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
CREATE TABLE IF NOT EXISTS outbound_deliveries (
  id CHAR(36) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  dedupe_key VARCHAR(255) NOT NULL,
  payload_json JSON NOT NULL,
  delivered_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_outbound_deliveries_provider_dedupe_key (provider, dedupe_key),
  KEY idx_outbound_deliveries_provider_created_at (provider, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
] as const;

const migrationChecksum = (version: number, name: string, statements: readonly string[]) =>
  createHash("sha256")
    .update(`${version}\n${name}\n${statements.map((statement) => statement.trim()).join("\n;\n")}`)
    .digest("hex");

export const AMIGO_MIGRATIONS: MigrationDefinition[] = [
  {
    version: 1,
    name: "initial_mysql_schema",
    statements: [...initialMigrationStatements],
    checksum: migrationChecksum(1, "initial_mysql_schema", initialMigrationStatements),
  },
  {
    version: 2,
    name: "conversation_initial_system_prompt",
    statements: [
      `
SET @amigo_has_initial_system_prompt = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'conversation_state'
    AND column_name = 'initial_system_prompt'
)
      `,
      `
SET @amigo_add_initial_system_prompt_sql = IF(
  @amigo_has_initial_system_prompt = 0,
  'ALTER TABLE conversation_state ADD COLUMN initial_system_prompt LONGTEXT NULL AFTER conversation_id',
  'SELECT 1'
)
      `,
      `
PREPARE amigo_add_initial_system_prompt_stmt FROM @amigo_add_initial_system_prompt_sql
      `,
      `
EXECUTE amigo_add_initial_system_prompt_stmt
      `,
      `
DEALLOCATE PREPARE amigo_add_initial_system_prompt_stmt
      `,
    ],
    checksum: migrationChecksum(2, "conversation_initial_system_prompt", [
      `
SET @amigo_has_initial_system_prompt = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'conversation_state'
    AND column_name = 'initial_system_prompt'
)
      `,
      `
SET @amigo_add_initial_system_prompt_sql = IF(
  @amigo_has_initial_system_prompt = 0,
  'ALTER TABLE conversation_state ADD COLUMN initial_system_prompt LONGTEXT NULL AFTER conversation_id',
  'SELECT 1'
)
      `,
      `
PREPARE amigo_add_initial_system_prompt_stmt FROM @amigo_add_initial_system_prompt_sql
      `,
      `
EXECUTE amigo_add_initial_system_prompt_stmt
      `,
      `
DEALLOCATE PREPARE amigo_add_initial_system_prompt_stmt
      `,
    ]),
  },
  {
    version: 3,
    name: "better_auth_user_schema",
    statements: [
      `
SET @amigo_has_users_email = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'email'
)
      `,
      `
SET @amigo_add_users_email_sql = IF(
  @amigo_has_users_email = 0,
  'ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL AFTER display_name',
  'SELECT 1'
)
      `,
      `
PREPARE amigo_add_users_email_stmt FROM @amigo_add_users_email_sql
      `,
      `
EXECUTE amigo_add_users_email_stmt
      `,
      `
DEALLOCATE PREPARE amigo_add_users_email_stmt
      `,
      `
SET @amigo_has_users_email_verified = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'email_verified'
)
      `,
      `
SET @amigo_add_users_email_verified_sql = IF(
  @amigo_has_users_email_verified = 0,
  'ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER email',
  'SELECT 1'
)
      `,
      `
PREPARE amigo_add_users_email_verified_stmt FROM @amigo_add_users_email_verified_sql
      `,
      `
EXECUTE amigo_add_users_email_verified_stmt
      `,
      `
DEALLOCATE PREPARE amigo_add_users_email_verified_stmt
      `,
      `
SET @amigo_has_users_image = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'image'
)
      `,
      `
SET @amigo_add_users_image_sql = IF(
  @amigo_has_users_image = 0,
  'ALTER TABLE users ADD COLUMN image VARCHAR(2048) NULL AFTER email_verified',
  'SELECT 1'
)
      `,
      `
PREPARE amigo_add_users_image_stmt FROM @amigo_add_users_image_sql
      `,
      `
EXECUTE amigo_add_users_image_stmt
      `,
      `
DEALLOCATE PREPARE amigo_add_users_image_stmt
      `,
      `
SET @amigo_has_users_email_index = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND index_name = 'uq_users_email'
)
      `,
      `
SET @amigo_add_users_email_index_sql = IF(
  @amigo_has_users_email_index = 0,
  'ALTER TABLE users ADD UNIQUE KEY uq_users_email (email)',
  'SELECT 1'
)
      `,
      `
PREPARE amigo_add_users_email_index_stmt FROM @amigo_add_users_email_index_sql
      `,
      `
EXECUTE amigo_add_users_email_index_stmt
      `,
      `
DEALLOCATE PREPARE amigo_add_users_email_index_stmt
      `,
      `
CREATE TABLE IF NOT EXISTS auth_sessions (
  id CHAR(36) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  token VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  ip_address VARCHAR(255) NULL,
  user_agent VARCHAR(1024) NULL,
  user_id CHAR(36) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_sessions_token (token),
  KEY idx_auth_sessions_user_id (user_id),
  CONSTRAINT fk_auth_sessions_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `,
      `
CREATE TABLE IF NOT EXISTS auth_accounts (
  id CHAR(36) NOT NULL,
  account_id VARCHAR(255) NOT NULL,
  provider_id VARCHAR(128) NOT NULL,
  user_id CHAR(36) NOT NULL,
  access_token LONGTEXT NULL,
  refresh_token LONGTEXT NULL,
  id_token LONGTEXT NULL,
  access_token_expires_at DATETIME(3) NULL,
  refresh_token_expires_at DATETIME(3) NULL,
  scope VARCHAR(1024) NULL,
  password LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_accounts_provider_account (provider_id, account_id),
  KEY idx_auth_accounts_user_id (user_id),
  CONSTRAINT fk_auth_accounts_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `,
      `
CREATE TABLE IF NOT EXISTS auth_verifications (
  id CHAR(36) NOT NULL,
  identifier VARCHAR(255) NOT NULL,
  value LONGTEXT NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_auth_verifications_identifier (identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `,
    ],
    checksum: migrationChecksum(3, "better_auth_user_schema", [
      `
SET @amigo_has_users_email = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'email'
)
      `,
      `
SET @amigo_add_users_email_sql = IF(
  @amigo_has_users_email = 0,
  'ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL AFTER display_name',
  'SELECT 1'
)
      `,
      `
PREPARE amigo_add_users_email_stmt FROM @amigo_add_users_email_sql
      `,
      `
EXECUTE amigo_add_users_email_stmt
      `,
      `
DEALLOCATE PREPARE amigo_add_users_email_stmt
      `,
      `
SET @amigo_has_users_email_verified = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'email_verified'
)
      `,
      `
SET @amigo_add_users_email_verified_sql = IF(
  @amigo_has_users_email_verified = 0,
  'ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER email',
  'SELECT 1'
)
      `,
      `
PREPARE amigo_add_users_email_verified_stmt FROM @amigo_add_users_email_verified_sql
      `,
      `
EXECUTE amigo_add_users_email_verified_stmt
      `,
      `
DEALLOCATE PREPARE amigo_add_users_email_verified_stmt
      `,
      `
SET @amigo_has_users_image = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'image'
)
      `,
      `
SET @amigo_add_users_image_sql = IF(
  @amigo_has_users_image = 0,
  'ALTER TABLE users ADD COLUMN image VARCHAR(2048) NULL AFTER email_verified',
  'SELECT 1'
)
      `,
      `
PREPARE amigo_add_users_image_stmt FROM @amigo_add_users_image_sql
      `,
      `
EXECUTE amigo_add_users_image_stmt
      `,
      `
DEALLOCATE PREPARE amigo_add_users_image_stmt
      `,
      `
SET @amigo_has_users_email_index = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND index_name = 'uq_users_email'
)
      `,
      `
SET @amigo_add_users_email_index_sql = IF(
  @amigo_has_users_email_index = 0,
  'ALTER TABLE users ADD UNIQUE KEY uq_users_email (email)',
  'SELECT 1'
)
      `,
      `
PREPARE amigo_add_users_email_index_stmt FROM @amigo_add_users_email_index_sql
      `,
      `
EXECUTE amigo_add_users_email_index_stmt
      `,
      `
DEALLOCATE PREPARE amigo_add_users_email_index_stmt
      `,
      `
CREATE TABLE IF NOT EXISTS auth_sessions (
  id CHAR(36) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  token VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  ip_address VARCHAR(255) NULL,
  user_agent VARCHAR(1024) NULL,
  user_id CHAR(36) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_sessions_token (token),
  KEY idx_auth_sessions_user_id (user_id),
  CONSTRAINT fk_auth_sessions_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `,
      `
CREATE TABLE IF NOT EXISTS auth_accounts (
  id CHAR(36) NOT NULL,
  account_id VARCHAR(255) NOT NULL,
  provider_id VARCHAR(128) NOT NULL,
  user_id CHAR(36) NOT NULL,
  access_token LONGTEXT NULL,
  refresh_token LONGTEXT NULL,
  id_token LONGTEXT NULL,
  access_token_expires_at DATETIME(3) NULL,
  refresh_token_expires_at DATETIME(3) NULL,
  scope VARCHAR(1024) NULL,
  password LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_accounts_provider_account (provider_id, account_id),
  KEY idx_auth_accounts_user_id (user_id),
  CONSTRAINT fk_auth_accounts_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `,
      `
CREATE TABLE IF NOT EXISTS auth_verifications (
  id CHAR(36) NOT NULL,
  identifier VARCHAR(255) NOT NULL,
  value LONGTEXT NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_auth_verifications_identifier (identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `,
    ]),
  },
];

const ensureSchemaMigrationsTable = async (pool: Pool): Promise<void> => {
  await pool.execute(schemaMigrationsTableSql);
};

export async function getAppliedMysqlMigrations(pool: Pool): Promise<MigrationRecord[]> {
  await ensureSchemaMigrationsTable(pool);
  const [rows] = await pool.query(
    "SELECT version, name, checksum, applied_at AS appliedAt FROM schema_migrations ORDER BY version ASC",
  );
  return rows as MigrationRecord[];
}

const getMigrationByVersion = (version: number): MigrationDefinition | undefined =>
  AMIGO_MIGRATIONS.find((migration) => migration.version === version);

export async function runAmigoMysqlMigrations(
  pool: Pool,
  migrations: readonly MigrationDefinition[] = AMIGO_MIGRATIONS,
): Promise<MigrationRunSummary> {
  await ensureSchemaMigrationsTable(pool);

  const [appliedRows] = await pool.query(
    "SELECT version, name, checksum, applied_at AS appliedAt FROM schema_migrations ORDER BY version ASC",
  );
  const appliedByVersion = new Map(
    (appliedRows as MigrationRecord[]).map((row) => [row.version, row]),
  );

  const summary: MigrationRunSummary = {
    applied: [],
    skipped: [],
  };

  for (const migration of migrations) {
    const applied = appliedByVersion.get(migration.version);
    if (applied) {
      if (applied.checksum !== migration.checksum) {
        throw new Error(
          `Migration ${migration.version}:${migration.name} checksum mismatch. Expected ${migration.checksum}, found ${applied.checksum}.`,
        );
      }
      summary.skipped.push({ version: migration.version, name: migration.name });
      continue;
    }

    for (const statement of migration.statements) {
      const trimmedStatement = statement.trim();
      if (!trimmedStatement) {
        continue;
      }
      await pool.query(trimmedStatement);
    }

    await pool.execute("INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)", [
      migration.version,
      migration.name,
      migration.checksum,
    ]);
    summary.applied.push({ version: migration.version, name: migration.name });
  }

  return summary;
}

export async function ensureAmigoMysqlSchema(pool: Pool): Promise<MigrationRunSummary> {
  return runAmigoMysqlMigrations(pool);
}

const fetchTenantBySlug = async (
  connection: PoolConnection,
  tenantSlug: string,
): Promise<{ id: string; slug: string; name: string } | null> =>
  fetchRow<{ id: string; slug: string; name: string }>(
    connection,
    "SELECT id, slug, name FROM tenants WHERE slug = ? LIMIT 1",
    [tenantSlug],
  );

const fetchUserByTenantId = async (
  connection: PoolConnection,
  tenantId: string,
): Promise<{
  id: string;
  tenantId: string;
  kind: string;
  displayName: string;
  status: string;
} | null> =>
  fetchRow<{ id: string; tenantId: string; kind: string; displayName: string; status: string }>(
    connection,
    "SELECT id, tenant_id AS tenantId, kind, display_name AS displayName, status FROM users WHERE tenant_id = ? LIMIT 1",
    [tenantId],
  );

export async function bootstrapDefaultLocalWebUser(
  pool: Pool,
  options: LocalWebBootstrapOptions = {},
): Promise<LocalWebBootstrapResult> {
  const tenantSlug = (options.tenantSlug || "local-web").trim() || "local-web";
  const tenantName = (options.tenantName || "Local Web").trim() || "Local Web";
  const userDisplayName = (options.userDisplayName || "Local Web").trim() || "Local Web";

  return withAmigoTransaction(pool, async (connection) => {
    const existingTenant = await fetchTenantBySlug(connection, tenantSlug);
    if (!existingTenant) {
      await connection.execute("INSERT INTO tenants (id, slug, name) VALUES (?, ?, ?)", [
        randomUUID(),
        tenantSlug,
        tenantName,
      ]);
    } else if (existingTenant.name !== tenantName) {
      await connection.execute("UPDATE tenants SET name = ? WHERE slug = ?", [
        tenantName,
        tenantSlug,
      ]);
    }

    const tenant = await fetchTenantBySlug(connection, tenantSlug);
    if (!tenant) {
      throw new Error(`Failed to bootstrap default tenant for slug ${tenantSlug}`);
    }

    const existingUser = await fetchUserByTenantId(connection, tenant.id);
    if (!existingUser) {
      await connection.execute(
        "INSERT INTO users (id, tenant_id, kind, display_name, email, email_verified, image, status) VALUES (?, ?, 'local_web', ?, ?, 0, NULL, 'active')",
        [randomUUID(), tenant.id, userDisplayName, `local-web-${tenant.id}@amigo.local`],
      );
    } else if (existingUser.displayName !== userDisplayName || existingUser.kind !== "local_web") {
      await connection.execute(
        "UPDATE users SET kind = 'local_web', display_name = ?, status = 'active' WHERE tenant_id = ?",
        [userDisplayName, tenant.id],
      );
    }

    const user = await fetchUserByTenantId(connection, tenant.id);
    if (!user) {
      throw new Error(`Failed to bootstrap default local web user for tenant ${tenant.id}`);
    }

    return {
      tenant,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        kind: "local_web",
        displayName: user.displayName,
        status: user.status,
      },
      createdTenant: !existingTenant,
      createdUser: !existingUser,
    };
  });
}

export async function ensureDefaultLocalWebUser(
  pool: Pool,
  options: LocalWebBootstrapOptions = {},
): Promise<LocalWebBootstrapResult> {
  return bootstrapDefaultLocalWebUser(pool, options);
}

export function getAmigoMigrationByVersion(version: number): MigrationDefinition | undefined {
  return getMigrationByVersion(version);
}

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenants (
  id CHAR(36) NOT NULL,
  slug VARCHAR(191) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenants_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  tenant_id CHAR(36) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  image VARCHAR(2048) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_tenant_id (tenant_id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_kind_status (kind, status),
  CONSTRAINT fk_users_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_context_snapshots (
  id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NOT NULL,
  request_id CHAR(36) NOT NULL,
  conversation_type VARCHAR(32) NOT NULL,
  model VARCHAR(191) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  config_id VARCHAR(191) NULL,
  workflow_phase VARCHAR(32) NULL,
  agent_role VARCHAR(32) NULL,
  message_count INT UNSIGNED NOT NULL,
  tool_names_json JSON NOT NULL,
  options_json JSON NOT NULL,
  messages_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_conversation_context_snapshots_request_id (request_id),
  KEY idx_conversation_context_snapshots_conversation_created_at (conversation_id, created_at),
  CONSTRAINT fk_conversation_context_snapshots_conversation_id FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_state (
  conversation_id CHAR(36) NOT NULL,
  initial_system_prompt LONGTEXT NULL,
  tool_names_json JSON NOT NULL,
  auto_approve_tool_names_json JSON NOT NULL,
  pending_tool_call_json JSON NULL,
  subtasks_json JSON NOT NULL,
  context_usage_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (conversation_id),
  CONSTRAINT fk_conversation_state_conversation_id FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_verifications (
  id CHAR(36) NOT NULL,
  identifier VARCHAR(255) NOT NULL,
  value LONGTEXT NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_auth_verifications_identifier (identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

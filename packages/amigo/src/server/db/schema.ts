import {
  bigint,
  char,
  customType,
  datetime,
  int,
  json,
  longtext,
  mysqlTable,
  primaryKey,
  text,
  tinyint,
  unique,
  varchar,
} from "drizzle-orm/mysql-core";

const longBlob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "longblob";
  },
});

export const tenantsTable = mysqlTable(
  "tenants",
  {
    id: char("id", { length: 36 }).notNull().primaryKey(),
    slug: varchar("slug", { length: 191 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
    updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
  },
  (table) => ({
    slugUnique: unique("uq_tenants_slug").on(table.slug),
  }),
);

export const usersTable = mysqlTable(
  "users",
  {
    id: char("id", { length: 36 }).notNull().primaryKey(),
    tenantId: char("tenant_id", { length: 36 }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    emailVerified: tinyint("email_verified").notNull(),
    image: varchar("image", { length: 2048 }),
    status: varchar("status", { length: 32 }).notNull(),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
    updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
  },
  (table) => ({
    tenantIdUnique: unique("uq_users_tenant_id").on(table.tenantId),
    emailUnique: unique("uq_users_email").on(table.email),
  }),
);

export const authSessionsTable = mysqlTable(
  "auth_sessions",
  {
    id: char("id", { length: 36 }).notNull().primaryKey(),
    expiresAt: datetime("expires_at", { mode: "string", fsp: 3 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
    updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
    ipAddress: varchar("ip_address", { length: 255 }),
    userAgent: varchar("user_agent", { length: 1024 }),
    userId: char("user_id", { length: 36 }).notNull(),
  },
  (table) => ({
    tokenUnique: unique("uq_auth_sessions_token").on(table.token),
  }),
);

export const authAccountsTable = mysqlTable(
  "auth_accounts",
  {
    id: char("id", { length: 36 }).notNull().primaryKey(),
    accountId: varchar("account_id", { length: 255 }).notNull(),
    providerId: varchar("provider_id", { length: 128 }).notNull(),
    userId: char("user_id", { length: 36 }).notNull(),
    accessToken: longtext("access_token"),
    refreshToken: longtext("refresh_token"),
    idToken: longtext("id_token"),
    accessTokenExpiresAt: datetime("access_token_expires_at", { mode: "string", fsp: 3 }),
    refreshTokenExpiresAt: datetime("refresh_token_expires_at", { mode: "string", fsp: 3 }),
    scope: varchar("scope", { length: 1024 }),
    password: longtext("password"),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
    updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
  },
  (table) => ({
    providerAccountUnique: unique("uq_auth_accounts_provider_account").on(
      table.providerId,
      table.accountId,
    ),
  }),
);

export const authVerificationsTable = mysqlTable("auth_verifications", {
  id: char("id", { length: 36 }).notNull().primaryKey(),
  identifier: varchar("identifier", { length: 255 }).notNull(),
  value: longtext("value").notNull(),
  expiresAt: datetime("expires_at", { mode: "string", fsp: 3 }).notNull(),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
});

export const externalIdentitiesTable = mysqlTable(
  "external_identities",
  {
    id: char("id", { length: 36 }).notNull().primaryKey(),
    userId: char("user_id", { length: 36 }).notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    externalId: varchar("external_id", { length: 191 }).notNull(),
    metadataJson: json("metadata_json").$type<Record<string, unknown>>().notNull(),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  },
  (table) => ({
    providerExternalUnique: unique("uq_external_identities_provider_external_id").on(
      table.provider,
      table.externalId,
    ),
  }),
);

export const notificationChannelsTable = mysqlTable(
  "notification_channels",
  {
    id: char("id", { length: 36 }).notNull().primaryKey(),
    userId: char("user_id", { length: 36 }).notNull(),
    type: varchar("type", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    configJson: json("config_json").$type<Record<string, unknown>>().notNull(),
    isDefault: tinyint("is_default").notNull(),
    enabled: tinyint("enabled").notNull(),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
    updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
  },
  (table) => ({
    userTypeNameUnique: unique("uq_notification_channels_user_type_name").on(
      table.userId,
      table.type,
      table.name,
    ),
  }),
);

export const userModelConfigsTable = mysqlTable("user_model_configs", {
  userId: char("user_id", { length: 36 }).notNull().primaryKey(),
  settingsJson: json("settings_json").$type<Record<string, unknown>>().notNull(),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
});

export const appSettingsTable = mysqlTable("app_settings", {
  key: varchar("key", { length: 191 }).notNull().primaryKey(),
  settingsJson: json("settings_json").$type<Record<string, unknown>>().notNull(),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
});

export const conversationsTable = mysqlTable("conversations", {
  id: char("id", { length: 36 }).notNull().primaryKey(),
  userId: char("user_id", { length: 36 }).notNull(),
  parentId: char("parent_id", { length: 36 }),
  type: varchar("type", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  contextJson: json("context_json").$type<Record<string, unknown>>().notNull(),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
  lastMessageAt: datetime("last_message_at", { mode: "string", fsp: 3 }),
});

export const conversationMessagesTable = mysqlTable(
  "conversation_messages",
  {
    id: char("id", { length: 36 }).notNull().primaryKey(),
    conversationId: char("conversation_id", { length: 36 }).notNull(),
    seq: bigint("seq", { mode: "number", unsigned: true }).notNull(),
    role: varchar("role", { length: 32 }).notNull(),
    messageType: varchar("message_type", { length: 32 }).notNull(),
    content: longtext("content").notNull(),
    attachmentsJson: json("attachments_json").$type<unknown[]>().notNull(),
    partial: tinyint("partial").notNull(),
    sourceUpdateTime: datetime("source_update_time", { mode: "string", fsp: 3 }),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  },
  (table) => ({
    conversationSeqUnique: unique("uq_conversation_messages_conversation_seq").on(
      table.conversationId,
      table.seq,
    ),
  }),
);

export const conversationContextSnapshotsTable = mysqlTable(
  "conversation_context_snapshots",
  {
    id: char("id", { length: 36 }).notNull().primaryKey(),
    conversationId: char("conversation_id", { length: 36 }).notNull(),
    requestId: char("request_id", { length: 36 }).notNull(),
    conversationType: varchar("conversation_type", { length: 32 }).notNull(),
    model: varchar("model", { length: 191 }).notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    configId: varchar("config_id", { length: 191 }),
    workflowPhase: varchar("workflow_phase", { length: 32 }),
    agentRole: varchar("agent_role", { length: 32 }),
    messageCount: int("message_count", { unsigned: true }).notNull(),
    toolNamesJson: json("tool_names_json").$type<string[]>().notNull(),
    optionsJson: json("options_json").$type<Record<string, unknown>>().notNull(),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  },
  (table) => ({
    requestUnique: unique("uq_conversation_context_snapshots_request_id").on(table.requestId),
  }),
);

export const conversationStateTable = mysqlTable("conversation_state", {
  conversationId: char("conversation_id", { length: 36 }).notNull().primaryKey(),
  initialSystemPrompt: longtext("initial_system_prompt"),
  toolNamesJson: json("tool_names_json").$type<string[]>().notNull(),
  modelConfigJson: json("model_config_json").$type<Record<string, unknown> | null>(),
  autoApproveToolNamesJson: json("auto_approve_tool_names_json").$type<string[]>().notNull(),
  pendingToolCallJson: json("pending_tool_call_json").$type<unknown | null>(),
  executionTasksJson: json("subtasks_json").$type<Record<string, unknown>>().notNull(),
  contextUsageJson: json("context_usage_json").$type<unknown | null>(),
  workflowStateJson: json("workflow_state_json").$type<Record<string, unknown> | null>(),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
});

export const automationsTable = mysqlTable(
  "automations",
  {
    id: char("id", { length: 36 }).notNull().primaryKey(),
    userId: char("user_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    prompt: longtext("prompt").notNull(),
    skillIdsJson: json("skill_ids_json").$type<string[]>().notNull(),
    contextJson: json("context_json").$type<Record<string, unknown>>().notNull(),
    scheduleType: varchar("schedule_type", { length: 32 }).notNull(),
    scheduleJson: json("schedule_json").$type<Record<string, unknown>>().notNull(),
    enabled: tinyint("enabled").notNull(),
    nextRunAt: datetime("next_run_at", { mode: "string", fsp: 3 }),
    lastRunAt: datetime("last_run_at", { mode: "string", fsp: 3 }),
    lastError: longtext("last_error"),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
    updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
  },
  (table) => ({
    userNameUnique: unique("uq_automations_user_name").on(table.userId, table.name),
  }),
);

export const automationRunsTable = mysqlTable("automation_runs", {
  id: char("id", { length: 36 }).notNull().primaryKey(),
  automationId: char("automation_id", { length: 36 }).notNull(),
  conversationId: char("conversation_id", { length: 36 }),
  status: varchar("status", { length: 32 }).notNull(),
  triggeredAt: datetime("triggered_at", { mode: "string", fsp: 3 }).notNull(),
  startedAt: datetime("started_at", { mode: "string", fsp: 3 }),
  finishedAt: datetime("finished_at", { mode: "string", fsp: 3 }),
  error: longtext("error"),
});

export const documentsTable = mysqlTable(
  "documents",
  {
    id: char("id", { length: 36 }).notNull().primaryKey(),
    ownerConversationId: char("owner_conversation_id", { length: 36 }),
    userId: char("user_id", { length: 36 }).notNull(),
    docScope: varchar("doc_scope", { length: 32 }).notNull(),
    docKey: varchar("doc_key", { length: 255 }).notNull(),
    format: varchar("format", { length: 32 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    contentText: longtext("content_text"),
    contentJson: json("content_json").$type<Record<string, unknown> | null>(),
    version: int("version", { unsigned: true }).notNull(),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
    updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
  },
  (table) => ({
    userScopeKeyUnique: unique("uq_documents_user_scope_key").on(
      table.userId,
      table.docScope,
      table.docKey,
    ),
  }),
);

export const skillsTable = mysqlTable(
  "skills",
  {
    id: char("id", { length: 36 }).notNull().primaryKey(),
    userId: char("user_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    skillMarkdown: longtext("skill_markdown").notNull(),
    resourceManifestJson: json("resource_manifest_json").$type<Record<string, unknown>>().notNull(),
    path: varchar("path", { length: 255 }).notNull(),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
    updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
  },
  (table) => ({
    userNameUnique: unique("uq_skills_user_name").on(table.userId, table.name),
  }),
);

export const skillFilesTable = mysqlTable(
  "skill_files",
  {
    skillId: char("skill_id", { length: 36 }).notNull(),
    relativePath: varchar("relative_path", { length: 512 }).notNull(),
    contentText: longtext("content_text"),
    contentBlob: longBlob("content_blob"),
    mode: int("mode").notNull(),
    mimeType: varchar("mime_type", { length: 255 }),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
    updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.skillId, table.relativePath] }),
  }),
);

export const integrationSessionsTable = mysqlTable(
  "integration_sessions",
  {
    id: char("id", { length: 36 }).notNull().primaryKey(),
    provider: varchar("provider", { length: 64 }).notNull(),
    sessionKey: varchar("session_key", { length: 255 }).notNull(),
    userId: char("user_id", { length: 36 }).notNull(),
    conversationId: char("conversation_id", { length: 36 }),
    updatedAt: datetime("updated_at", { mode: "string", fsp: 3 }).notNull(),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  },
  (table) => ({
    providerSessionUnique: unique("uq_integration_sessions_provider_session_key").on(
      table.provider,
      table.sessionKey,
    ),
  }),
);

export const outboundDeliveriesTable = mysqlTable(
  "outbound_deliveries",
  {
    id: char("id", { length: 36 }).notNull().primaryKey(),
    provider: varchar("provider", { length: 64 }).notNull(),
    dedupeKey: varchar("dedupe_key", { length: 255 }).notNull(),
    payloadJson: json("payload_json").$type<Record<string, unknown>>().notNull(),
    deliveredAt: datetime("delivered_at", { mode: "string", fsp: 3 }),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull(),
  },
  (table) => ({
    providerDedupeUnique: unique("uq_outbound_deliveries_provider_dedupe_key").on(
      table.provider,
      table.dedupeKey,
    ),
  }),
);

import {
  getGlobalState,
  type ModelConfig,
  type ModelSelection,
  type ResolvedModelConfig,
  resolveModelConfigFromConfigs,
} from "@amigo-llm/backend";
import type { RowDataPacket } from "mysql2/promise";
import { ensureMysqlSchemaUpToDate, mysqlExecute, mysqlQuery, parseJsonColumn } from "../db";

export interface UserModelConfigSettingsRecord {
  modelConfigs: Record<string, ModelConfig>;
  defaultModel: ModelSelection | null;
  memoryExtractorModel: ModelSelection | null;
}

export interface PublicModelConfig extends Omit<ModelConfig, "apiKey"> {
  apiKey: "";
  hasApiKey: boolean;
  sourceConfigId: string;
}

export interface PublicUserModelConfigSettings {
  modelConfigs: Record<string, PublicModelConfig>;
  defaultModel: ModelSelection | null;
  memoryExtractorModel: ModelSelection | null;
}

export interface UserModelConfigUpsertInput {
  modelConfigs: Record<
    string,
    Omit<ModelConfig, "apiKey"> & {
      apiKey?: string;
      sourceConfigId?: string;
    }
  >;
  defaultModel: ModelSelection | null;
  memoryExtractorModel: ModelSelection | null;
}

type UserModelConfigRow = RowDataPacket & {
  user_id: string;
  settings_json: unknown;
};

const settingsCache = new Map<string, UserModelConfigSettingsRecord>();

const cloneSettingsRecord = (
  settings: UserModelConfigSettingsRecord,
): UserModelConfigSettingsRecord => ({
  modelConfigs: Object.fromEntries(
    Object.entries(settings.modelConfigs).map(([configId, config]) => [configId, { ...config }]),
  ),
  defaultModel: settings.defaultModel ? { ...settings.defaultModel } : null,
  memoryExtractorModel: settings.memoryExtractorModel ? { ...settings.memoryExtractorModel } : null,
});

const normalizeSettingsRecord = (value: unknown): UserModelConfigSettingsRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as {
    modelConfigs?: unknown;
    defaultModel?: unknown;
    memoryExtractorModel?: unknown;
  };
  if (
    !record.modelConfigs ||
    typeof record.modelConfigs !== "object" ||
    Array.isArray(record.modelConfigs)
  ) {
    return null;
  }

  const modelConfigs: Record<string, ModelConfig> = {};
  for (const [configId, rawConfig] of Object.entries(record.modelConfigs)) {
    if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
      return null;
    }
    const config = rawConfig as Record<string, unknown>;
    const provider = typeof config.provider === "string" ? config.provider.trim() : "";
    const apiKey = typeof config.apiKey === "string" ? config.apiKey.trim() : "";
    const models = Array.isArray(config.models) ? config.models : [];
    if (!configId.trim() || !provider || !apiKey || models.length === 0) {
      return null;
    }

    modelConfigs[configId] = {
      provider,
      apiKey,
      ...(typeof config.baseURL === "string" && config.baseURL.trim()
        ? { baseURL: config.baseURL.trim() }
        : {}),
      models: models
        .map((item) =>
          item && typeof item === "object" && !Array.isArray(item)
            ? {
                name: typeof item.name === "string" ? item.name.trim() : "",
                ...(typeof item.contextWindow === "number"
                  ? { contextWindow: item.contextWindow }
                  : {}),
                ...(typeof item.thinkType === "string" && item.thinkType.trim()
                  ? { thinkType: item.thinkType.trim() }
                  : {}),
              }
            : null,
        )
        .filter((item): item is ModelConfig["models"][number] => !!item?.name),
      ...(typeof config.compressionThreshold === "number"
        ? { compressionThreshold: config.compressionThreshold }
        : {}),
      ...(typeof config.targetRatio === "number" ? { targetRatio: config.targetRatio } : {}),
      ...(typeof config.preserveRecentMessages === "number"
        ? { preserveRecentMessages: config.preserveRecentMessages }
        : {}),
      ...(typeof config.minMessagesToCompress === "number"
        ? { minMessagesToCompress: config.minMessagesToCompress }
        : {}),
    };
  }

  const normalizeSelection = (selection: unknown): ModelSelection | null =>
    selection &&
    typeof selection === "object" &&
    !Array.isArray(selection) &&
    typeof (selection as { model?: unknown }).model === "string"
      ? {
          model: ((selection as { model: string }).model || "").trim(),
          ...(typeof (selection as { configId?: unknown }).configId === "string" &&
          (selection as { configId: string }).configId.trim()
            ? { configId: (selection as { configId: string }).configId.trim() }
            : {}),
        }
      : null;

  const defaultModel = normalizeSelection(record.defaultModel);
  const memoryExtractorModel = normalizeSelection(record.memoryExtractorModel);

  return {
    modelConfigs,
    defaultModel: defaultModel?.model ? defaultModel : null,
    memoryExtractorModel: memoryExtractorModel?.model ? memoryExtractorModel : null,
  };
};

const readSettingsRow = async (userId: string): Promise<UserModelConfigSettingsRecord | null> => {
  await ensureMysqlSchemaUpToDate();
  const rows = await mysqlQuery<UserModelConfigRow>(
    "SELECT user_id, settings_json FROM user_model_configs WHERE user_id = ? LIMIT 1",
    [userId],
  );
  const rawSettings = rows[0]?.settings_json;
  if (!rawSettings) {
    return null;
  }

  return normalizeSettingsRecord(parseJsonColumn(rawSettings, {}));
};

const toPublicSettings = (
  settings: UserModelConfigSettingsRecord,
): PublicUserModelConfigSettings => ({
  modelConfigs: Object.fromEntries(
    Object.entries(settings.modelConfigs).map(([configId, config]) => [
      configId,
      {
        ...config,
        apiKey: "",
        hasApiKey: !!config.apiKey.trim(),
        sourceConfigId: configId,
      },
    ]),
  ),
  defaultModel: settings.defaultModel ? { ...settings.defaultModel } : null,
  memoryExtractorModel: settings.memoryExtractorModel ? { ...settings.memoryExtractorModel } : null,
});

export const warmUserModelConfigStore = async (): Promise<void> => {
  await ensureMysqlSchemaUpToDate();
  const rows = await mysqlQuery<UserModelConfigRow>(
    "SELECT user_id, settings_json FROM user_model_configs",
    [],
  );

  settingsCache.clear();
  for (const row of rows) {
    const settings = normalizeSettingsRecord(parseJsonColumn(row.settings_json, {}));
    if (settings) {
      settingsCache.set(row.user_id, settings);
    }
  }
};

export const readUserModelConfigSettings = async (
  userId: string,
): Promise<UserModelConfigSettingsRecord | null> => {
  const cached = settingsCache.get(userId);
  if (cached) {
    return cloneSettingsRecord(cached);
  }

  const settings = await readSettingsRow(userId);
  if (!settings) {
    return null;
  }

  settingsCache.set(userId, settings);
  return cloneSettingsRecord(settings);
};

export const readPublicUserModelConfigSettings = async (
  userId: string,
): Promise<PublicUserModelConfigSettings | null> => {
  const settings = await readUserModelConfigSettings(userId);
  return settings ? toPublicSettings(settings) : null;
};

export const upsertUserModelConfigSettings = async (
  userId: string,
  input: UserModelConfigUpsertInput,
): Promise<PublicUserModelConfigSettings> => {
  const existing = await readUserModelConfigSettings(userId);
  const nextModelConfigs: Record<string, ModelConfig> = {};

  for (const [configId, config] of Object.entries(input.modelConfigs)) {
    const nextConfigId = configId.trim();
    const sourceConfigId = config.sourceConfigId?.trim() || nextConfigId;
    const existingConfig =
      existing?.modelConfigs[sourceConfigId] || existing?.modelConfigs[nextConfigId] || null;
    const inputApiKey = config.apiKey?.trim() || "";
    if (existingConfig && existingConfig.provider !== config.provider && !inputApiKey) {
      throw new Error(`${configId || "模型配置"} 修改 provider 时必须重新填写 API 密钥`);
    }

    const nextApiKey = inputApiKey || existingConfig?.apiKey?.trim() || "";

    if (!nextConfigId || !nextApiKey) {
      throw new Error(`${configId || "模型配置"} 缺少 API 密钥`);
    }

    nextModelConfigs[nextConfigId] = {
      provider: config.provider,
      apiKey: nextApiKey,
      ...(config.baseURL?.trim() ? { baseURL: config.baseURL.trim() } : {}),
      models: config.models.map((model) => ({ ...model })),
      ...(typeof config.compressionThreshold === "number"
        ? { compressionThreshold: config.compressionThreshold }
        : {}),
      ...(typeof config.targetRatio === "number" ? { targetRatio: config.targetRatio } : {}),
      ...(typeof config.preserveRecentMessages === "number"
        ? { preserveRecentMessages: config.preserveRecentMessages }
        : {}),
      ...(typeof config.minMessagesToCompress === "number"
        ? { minMessagesToCompress: config.minMessagesToCompress }
        : {}),
    };
  }

  const nextSettings: UserModelConfigSettingsRecord = {
    modelConfigs: nextModelConfigs,
    defaultModel: input.defaultModel ? { ...input.defaultModel } : null,
    memoryExtractorModel: input.memoryExtractorModel ? { ...input.memoryExtractorModel } : null,
  };

  await ensureMysqlSchemaUpToDate();
  await mysqlExecute(
    `
      INSERT INTO user_model_configs (user_id, settings_json, created_at, updated_at)
      VALUES (?, CAST(? AS JSON), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE
        settings_json = VALUES(settings_json),
        updated_at = CURRENT_TIMESTAMP(3)
    `,
    [userId, JSON.stringify(nextSettings)],
  );

  settingsCache.set(userId, cloneSettingsRecord(nextSettings));
  return toPublicSettings(nextSettings);
};

export const resolveUserScopedModelConfig = (payload: {
  userId?: string;
  selection: string | ModelSelection;
}): ResolvedModelConfig | null => {
  const userId = payload.userId?.trim();
  if (userId) {
    const cached = settingsCache.get(userId);
    const resolved = resolveModelConfigFromConfigs(payload.selection, cached?.modelConfigs);
    if (resolved) {
      return resolved;
    }
  }

  const globalConfigs = getGlobalState("modelConfigs") ?? getGlobalState("modelContextConfigs");
  return resolveModelConfigFromConfigs(payload.selection, globalConfigs);
};

export const resolveUserScopedMemoryExtractorModelSelection = (payload: {
  userId?: string;
}): ModelSelection | null => {
  const userId = payload.userId?.trim();
  if (!userId) {
    return null;
  }

  const cached = settingsCache.get(userId);
  return cached?.memoryExtractorModel ? { ...cached.memoryExtractorModel } : null;
};

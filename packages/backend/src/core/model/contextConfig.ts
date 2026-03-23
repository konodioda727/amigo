import { getGlobalState } from "@/globalState";
import type { ModelProvider } from "./types";

export type ModelThinkType = "auto" | "enabled" | "disabled" | (string & {});

export interface ProviderModelConfig {
  name: string;
  contextWindow?: number;
  thinkType?: ModelThinkType;
}

export interface ModelSelection {
  configId?: string;
  model: string;
}

export interface ModelConfig {
  provider: ModelProvider;
  apiKey: string;
  baseURL?: string;
  models: ProviderModelConfig[];
  compressionThreshold?: number;
  targetRatio?: number;
  preserveRecentMessages?: number;
  minMessagesToCompress?: number;
}

export interface ResolvedModelConfig {
  configId: string;
  model: string;
  provider: ModelProvider;
  apiKey: string;
  baseURL?: string;
  contextWindow?: number;
  thinkType?: ModelThinkType;
  compressionThreshold?: number;
  targetRatio?: number;
  preserveRecentMessages?: number;
  minMessagesToCompress?: number;
}

export type ModelContextConfig = ModelConfig & { contextWindow: number };
export type ResolvedModelContextConfig = ResolvedModelConfig & { contextWindow: number };

const DEFAULT_COMPRESSION_THRESHOLD = 0.8;
const DEFAULT_TARGET_RATIO = 0.5;
const DEFAULT_PRESERVE_RECENT_MESSAGES = 8;
const DEFAULT_MIN_MESSAGES_TO_COMPRESS = 4;

const normalizeModelName = (model: string): string => model.trim().toLowerCase();
const normalizeConfigId = (configId: string): string => configId.trim().toLowerCase();

const clampRatio = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  if (value <= 0) {
    return fallback;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
};

const toPositiveInt = (value: number | undefined, fallback: number): number => {
  if (!Number.isFinite(value) || value === undefined) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
};

const buildResolvedModelConfig = (
  configId: string,
  config: ModelConfig,
  modelConfig: ProviderModelConfig,
): ResolvedModelConfig | null => {
  const provider = config.provider?.trim();
  const apiKey = config.apiKey?.trim();
  const baseURL = config.baseURL?.trim() || undefined;
  const model = modelConfig.name?.trim();
  const hasContextWindow =
    Number.isFinite(modelConfig.contextWindow) && (modelConfig.contextWindow || 0) > 0;

  if (!configId.trim() || !provider || !apiKey || !model) {
    return null;
  }

  const compressionThreshold = clampRatio(
    config.compressionThreshold ?? DEFAULT_COMPRESSION_THRESHOLD,
    DEFAULT_COMPRESSION_THRESHOLD,
  );
  const computedTargetRatio = clampRatio(
    config.targetRatio ?? DEFAULT_TARGET_RATIO,
    DEFAULT_TARGET_RATIO,
  );
  const targetRatio =
    computedTargetRatio >= compressionThreshold
      ? Math.max(0.1, Number((compressionThreshold - 0.1).toFixed(3)))
      : computedTargetRatio;

  return {
    configId,
    model,
    provider,
    apiKey,
    baseURL,
    ...(hasContextWindow ? { contextWindow: Math.floor(modelConfig.contextWindow as number) } : {}),
    ...(modelConfig.thinkType ? { thinkType: modelConfig.thinkType } : {}),
    compressionThreshold,
    targetRatio,
    preserveRecentMessages: toPositiveInt(
      config.preserveRecentMessages,
      DEFAULT_PRESERVE_RECENT_MESSAGES,
    ),
    minMessagesToCompress: toPositiveInt(
      config.minMessagesToCompress,
      DEFAULT_MIN_MESSAGES_TO_COMPRESS,
    ),
  };
};

const normalizeSelection = (selection: string | ModelSelection): ModelSelection => {
  if (typeof selection === "string") {
    return { model: selection };
  }
  return selection;
};

export const listAvailableModels = (
  configs = getGlobalState("modelConfigs") ?? getGlobalState("modelContextConfigs"),
): ResolvedModelConfig[] => {
  if (!configs) {
    return [];
  }

  const models: ResolvedModelConfig[] = [];
  for (const [configId, config] of Object.entries(configs)) {
    for (const modelConfig of config.models || []) {
      const resolved = buildResolvedModelConfig(configId, config, modelConfig);
      if (resolved) {
        models.push(resolved);
      }
    }
  }

  return models;
};

export const resolveModelConfig = (
  selection: string | ModelSelection,
): ResolvedModelConfig | null => {
  const normalizedSelection = normalizeSelection(selection);
  const normalizedModel = normalizeModelName(normalizedSelection.model);
  const normalizedConfigId = normalizedSelection.configId
    ? normalizeConfigId(normalizedSelection.configId)
    : null;

  for (const config of listAvailableModels()) {
    if (normalizeModelName(config.model) !== normalizedModel) {
      continue;
    }
    if (normalizedConfigId && normalizeConfigId(config.configId) !== normalizedConfigId) {
      continue;
    }
    return config;
  }

  return null;
};

export const resolveModelContextConfig = (
  selection: string | ModelSelection,
): ResolvedModelContextConfig | null => {
  const config = resolveModelConfig(selection);
  if (!config?.contextWindow) {
    return null;
  }

  return config as ResolvedModelContextConfig;
};

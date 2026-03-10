import { getGlobalState } from "@/globalState";
import type { ModelProvider } from "./types";

export interface ModelConfig {
  provider?: ModelProvider;
  baseURL?: string;
  contextWindow?: number;
  compressionThreshold?: number;
  targetRatio?: number;
  preserveRecentMessages?: number;
  minMessagesToCompress?: number;
}

export interface ResolvedModelConfig {
  model: string;
  provider?: ModelProvider;
  baseURL?: string;
  contextWindow?: number;
  compressionThreshold?: number;
  targetRatio?: number;
  preserveRecentMessages?: number;
  minMessagesToCompress?: number;
}

export type ModelContextConfig = ModelConfig & { contextWindow: number };
export type ResolvedModelContextConfig = ResolvedModelConfig & { contextWindow: number };

type RawModelConfig = ModelConfig | number;

const DEFAULT_COMPRESSION_THRESHOLD = 0.8;
const DEFAULT_TARGET_RATIO = 0.5;
const DEFAULT_PRESERVE_RECENT_MESSAGES = 8;
const DEFAULT_MIN_MESSAGES_TO_COMPRESS = 4;

const normalizeModelName = (model: string): string => model.trim().toLowerCase();

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

const normalizeConfig = (
  model: string,
  rawConfig: RawModelConfig | undefined,
): ResolvedModelConfig | null => {
  if (typeof rawConfig === "number") {
    if (!Number.isFinite(rawConfig) || rawConfig <= 0) {
      return null;
    }
    return {
      model,
      contextWindow: Math.floor(rawConfig),
      compressionThreshold: DEFAULT_COMPRESSION_THRESHOLD,
      targetRatio: DEFAULT_TARGET_RATIO,
      preserveRecentMessages: DEFAULT_PRESERVE_RECENT_MESSAGES,
      minMessagesToCompress: DEFAULT_MIN_MESSAGES_TO_COMPRESS,
    };
  }

  if (!rawConfig) {
    return null;
  }

  const provider = rawConfig.provider?.trim() || undefined;
  const baseURL = rawConfig.baseURL?.trim() || undefined;
  const hasContextWindow =
    Number.isFinite(rawConfig.contextWindow) && (rawConfig.contextWindow || 0) > 0;

  if (!hasContextWindow && !provider && !baseURL) {
    return null;
  }

  if (!hasContextWindow) {
    return {
      model,
      provider,
      baseURL,
    };
  }

  const compressionThreshold = clampRatio(
    rawConfig.compressionThreshold ?? DEFAULT_COMPRESSION_THRESHOLD,
    DEFAULT_COMPRESSION_THRESHOLD,
  );
  const computedTargetRatio = clampRatio(
    rawConfig.targetRatio ?? DEFAULT_TARGET_RATIO,
    DEFAULT_TARGET_RATIO,
  );
  const targetRatio =
    computedTargetRatio >= compressionThreshold
      ? Math.max(0.1, Number((compressionThreshold - 0.1).toFixed(3)))
      : computedTargetRatio;

  return {
    model,
    provider,
    baseURL,
    contextWindow: Math.floor(rawConfig.contextWindow as number),
    compressionThreshold,
    targetRatio,
    preserveRecentMessages: toPositiveInt(
      rawConfig.preserveRecentMessages,
      DEFAULT_PRESERVE_RECENT_MESSAGES,
    ),
    minMessagesToCompress: toPositiveInt(
      rawConfig.minMessagesToCompress,
      DEFAULT_MIN_MESSAGES_TO_COMPRESS,
    ),
  };
};

export const resolveModelConfig = (model: string): ResolvedModelConfig | null => {
  const normalizedModel = normalizeModelName(model);
  const configured = getGlobalState("modelConfigs") ?? getGlobalState("modelContextConfigs");
  const normalizedConfigured = configured
    ? Object.fromEntries(
        Object.entries(configured).map(([configuredModel, value]) => [
          normalizeModelName(configuredModel),
          value,
        ]),
      )
    : null;
  const rawConfig = normalizedConfigured?.[normalizedModel];
  return normalizeConfig(model, rawConfig);
};

export const resolveModelContextConfig = (model: string): ResolvedModelContextConfig | null => {
  const config = resolveModelConfig(model);
  if (!config?.contextWindow) {
    return null;
  }

  return config as ResolvedModelContextConfig;
};

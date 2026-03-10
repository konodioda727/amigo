import { getGlobalState } from "@/globalState";

export interface ModelContextConfig {
  contextWindow: number;
  compressionThreshold?: number;
  targetRatio?: number;
  preserveRecentMessages?: number;
  minMessagesToCompress?: number;
}

export interface ResolvedModelContextConfig {
  model: string;
  contextWindow: number;
  compressionThreshold: number;
  targetRatio: number;
  preserveRecentMessages: number;
  minMessagesToCompress: number;
}

type RawModelContextConfig = ModelContextConfig | number;

const DEFAULT_COMPRESSION_THRESHOLD = 0.8;
const DEFAULT_TARGET_RATIO = 0.5;
const DEFAULT_PRESERVE_RECENT_MESSAGES = 8;
const DEFAULT_MIN_MESSAGES_TO_COMPRESS = 4;

let cachedEnvConfigs: Record<string, RawModelContextConfig> | null = null;

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

const parseEnvConfigs = (): Record<string, RawModelContextConfig> => {
  if (cachedEnvConfigs) {
    return cachedEnvConfigs;
  }

  const raw = process.env.MODEL_CONTEXT_CONFIGS?.trim();
  if (!raw) {
    cachedEnvConfigs = {};
    return cachedEnvConfigs;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      cachedEnvConfigs = {};
      return cachedEnvConfigs;
    }

    cachedEnvConfigs = Object.fromEntries(
      Object.entries(parsed as Record<string, RawModelContextConfig>).map(([model, value]) => [
        normalizeModelName(model),
        value,
      ]),
    );
    return cachedEnvConfigs;
  } catch {
    cachedEnvConfigs = {};
    return cachedEnvConfigs;
  }
};

const normalizeConfig = (
  model: string,
  rawConfig: RawModelContextConfig | undefined,
): ResolvedModelContextConfig | null => {
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

  if (!rawConfig || !Number.isFinite(rawConfig.contextWindow) || rawConfig.contextWindow <= 0) {
    return null;
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
    contextWindow: Math.floor(rawConfig.contextWindow),
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

export const resolveModelContextConfig = (model: string): ResolvedModelContextConfig | null => {
  const normalizedModel = normalizeModelName(model);
  const configured = getGlobalState("modelContextConfigs");
  const normalizedConfigured = configured
    ? Object.fromEntries(
        Object.entries(configured).map(([configuredModel, value]) => [
          normalizeModelName(configuredModel),
          value,
        ]),
      )
    : null;
  const rawConfig = normalizedConfigured?.[normalizedModel] ?? parseEnvConfigs()[normalizedModel];
  return normalizeConfig(model, rawConfig);
};

import type {
  ModelConfig,
  ModelSelection,
  NotificationChannelRecord,
  ProviderModelConfig,
} from "@/utils/serverAdmin";
import { PROVIDER_OPTIONS } from "./constants";
import type { EditableModelConfig, EditableProviderModelConfig, EditableSettings } from "./types";

const buildModelUiId = (): string => crypto.randomUUID();

const hydrateModel = (model?: ProviderModelConfig): EditableProviderModelConfig => ({
  uiId: buildModelUiId(),
  name: model?.name || "",
  contextWindow: model?.contextWindow ?? 256000,
  thinkType: model?.thinkType || "enabled",
});

const serializeModel = (model: ProviderModelConfig): ProviderModelConfig => model;

export const hydrateModelConfigs = (
  modelConfigs: Record<string, ModelConfig>,
): Record<string, EditableModelConfig> =>
  Object.fromEntries(
    Object.entries(modelConfigs).map(([configId, config]) => [
      configId,
      {
        ...config,
        models: config.models.map((model) => hydrateModel(model)),
      },
    ]),
  );

export const serializeModelConfigs = (
  modelConfigs: Record<string, EditableModelConfig>,
): Record<string, ModelConfig> =>
  Object.fromEntries(
    Object.entries(modelConfigs).map(([configId, config]) => [
      configId,
      {
        ...config,
        models: config.models.map(({ uiId: _uiId, ...model }) =>
          serializeModel(model as ProviderModelConfig),
        ),
      },
    ]),
  );

export const hydrateEditableSettings = (
  modelConfigs: Record<string, ModelConfig>,
  defaultModel?: ModelSelection | null,
  memoryExtractorModel?: ModelSelection | null,
): EditableSettings => ({
  modelConfigs: hydrateModelConfigs(modelConfigs),
  defaultModel: defaultModel || null,
  memoryExtractorModel: memoryExtractorModel || null,
});

export const buildEmptyModel = (): EditableProviderModelConfig => hydrateModel();

export const buildEmptyProvider = (): EditableModelConfig => ({
  provider: "openai-compatible",
  apiKey: "",
  hasApiKey: false,
  baseURL: "",
  compressionThreshold: 0.8,
  targetRatio: 0.5,
  preserveRecentMessages: 8,
  minMessagesToCompress: 4,
  models: [buildEmptyModel()],
});

export const getNextConfigId = (modelConfigs: Record<string, ModelConfig>): string => {
  let index = Object.keys(modelConfigs).length + 1;
  while (modelConfigs[`provider-${index}`]) {
    index += 1;
  }
  return `provider-${index}`;
};

export const getProviderLabel = (provider: string) =>
  PROVIDER_OPTIONS.find((option) => option.value === provider)?.label || provider;

export const getChannelTypeLabel = (type: string) => {
  if (type === "feishu") {
    return "飞书";
  }
  return "未开放";
};

export const getChatTypeLabel = (chatType: string | undefined) => {
  if (chatType === "group") {
    return "群聊";
  }
  if (chatType === "p2p") {
    return "单聊";
  }
  return "未识别";
};

export const formatDateTime = (value: string | undefined) => {
  if (!value) {
    return "未记录";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未记录";
  }
  return date.toLocaleString("zh-CN", { hour12: false });
};

export const normalizeNotificationChannels = (
  channels: NotificationChannelRecord[],
): NotificationChannelRecord[] => {
  const normalized = channels.map((channel) => ({ ...channel }));
  const channelTypes = new Set(normalized.map((channel) => channel.type));

  for (const type of channelTypes) {
    const typedChannels = normalized.filter((channel) => channel.type === type);
    for (const channel of typedChannels) {
      if (!channel.enabled) {
        channel.isDefault = false;
      }
    }

    const defaultChannel =
      typedChannels.find((channel) => channel.enabled && channel.isDefault) ||
      typedChannels.find((channel) => channel.enabled) ||
      null;

    for (const channel of typedChannels) {
      channel.isDefault = defaultChannel ? channel.id === defaultChannel.id : false;
    }
  }

  return normalized;
};

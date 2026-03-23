import { getHttpBaseUrlFromWebSocketUrl } from "./sandboxEditor";

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  path: string;
  resourceManifest: {
    scripts: string[];
    references: string[];
    assets: string[];
    agents: string[];
    extraFiles: string[];
  };
  skillMarkdown: string;
  createdAt: string;
  updatedAt: string;
}

export type ModelThinkType = "auto" | "enabled" | "disabled" | string;

export interface ProviderModelConfig {
  name: string;
  contextWindow?: number;
  thinkType?: ModelThinkType;
}

export interface ModelConfig {
  provider: string;
  apiKey: string;
  baseURL?: string;
  models: ProviderModelConfig[];
  compressionThreshold?: number;
  targetRatio?: number;
  preserveRecentMessages?: number;
  minMessagesToCompress?: number;
}

export interface ModelSelection {
  configId?: string;
  model: string;
}

export interface UserModelConfigSettings {
  hasUserConfig: boolean;
  modelConfigs: Record<string, ModelConfig>;
  defaultModel?: ModelSelection | null;
}

export interface ResolvedModelOption {
  configId: string;
  model: string;
  provider: string;
  apiKey: string;
  baseURL?: string;
  contextWindow?: number;
  thinkType?: ModelThinkType;
  compressionThreshold?: number;
  targetRatio?: number;
  preserveRecentMessages?: number;
  minMessagesToCompress?: number;
}

export type SkillSummary = Omit<SkillDefinition, "skillMarkdown">;

export interface SkillUpsertInput {
  id?: string;
  skillMarkdown: string;
}

export interface SkillMarketStatus {
  configured: boolean;
  provider: string;
}

export interface SkillMarketItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  author?: string;
  score?: number;
  stars?: number;
  detailUrl?: string;
  sourceUrl?: string;
  categories?: string[];
}

export type AutomationSchedule =
  | {
      type: "once";
      afterMinutes: number;
    }
  | {
      type: "interval";
      everyMinutes: number;
    }
  | {
      type: "daily";
      hour: number;
      minute: number;
    }
  | {
      type: "weekly";
      weekday: number;
      hour: number;
      minute: number;
    };

export interface AutomationDefinition {
  id: string;
  name: string;
  prompt: string;
  skillIds?: string[];
  context?: Record<string, unknown>;
  schedule: AutomationSchedule;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationUpsertInput {
  id?: string;
  name: string;
  prompt: string;
  skillIds?: string[];
  schedule: AutomationSchedule;
  enabled: boolean;
}

interface ErrorPayload {
  error?: string;
}

const readJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  const data = text ? (JSON.parse(text) as T | ErrorPayload) : ({} as T | ErrorPayload);
  if (!response.ok) {
    const message =
      typeof (data as ErrorPayload).error === "string"
        ? (data as ErrorPayload).error
        : `请求失败: ${response.status}`;
    throw new Error(message);
  }
  return data as T;
};

const getAdminBaseUrl = (wsUrl: string) => getHttpBaseUrlFromWebSocketUrl(wsUrl);

const withCredentials: RequestInit = {
  credentials: "include",
};

export const listSkills = async (wsUrl: string): Promise<SkillSummary[]> => {
  const response = await fetch(`${getAdminBaseUrl(wsUrl)}/api/skills`, withCredentials);
  return readJson<SkillSummary[]>(response);
};

export const flattenModelConfigs = (
  modelConfigs: Record<string, ModelConfig>,
): ResolvedModelOption[] => {
  return Object.entries(modelConfigs)
    .flatMap(([configId, config]) =>
      (config.models || []).map((modelConfig) => ({
        configId,
        model: modelConfig.name,
        provider: config.provider,
        apiKey: config.apiKey,
        ...(config.baseURL ? { baseURL: config.baseURL } : {}),
        ...(modelConfig.contextWindow ? { contextWindow: modelConfig.contextWindow } : {}),
        ...(modelConfig.thinkType ? { thinkType: modelConfig.thinkType } : {}),
        ...(config.compressionThreshold
          ? { compressionThreshold: config.compressionThreshold }
          : {}),
        ...(config.targetRatio ? { targetRatio: config.targetRatio } : {}),
        ...(config.preserveRecentMessages
          ? { preserveRecentMessages: config.preserveRecentMessages }
          : {}),
        ...(config.minMessagesToCompress
          ? { minMessagesToCompress: config.minMessagesToCompress }
          : {}),
      })),
    )
    .sort((left, right) => {
      const configCompare = left.configId.localeCompare(right.configId, "zh-CN");
      return configCompare !== 0 ? configCompare : left.model.localeCompare(right.model, "zh-CN");
    });
};

export const getUserModelConfigs = async (wsUrl: string): Promise<UserModelConfigSettings> => {
  const response = await fetch(`${getAdminBaseUrl(wsUrl)}/api/model-configs`, withCredentials);
  return readJson<UserModelConfigSettings>(response);
};

export const upsertUserModelConfigs = async (
  wsUrl: string,
  payload: Omit<UserModelConfigSettings, "hasUserConfig">,
): Promise<UserModelConfigSettings> => {
  const response = await fetch(`${getAdminBaseUrl(wsUrl)}/api/model-configs`, {
    ...withCredentials,
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return readJson<UserModelConfigSettings>(response);
};

export const getSkill = async (wsUrl: string, skillId: string): Promise<SkillDefinition> => {
  const response = await fetch(
    `${getAdminBaseUrl(wsUrl)}/api/skills/${encodeURIComponent(skillId)}`,
    withCredentials,
  );
  return readJson<SkillDefinition>(response);
};

export const upsertSkill = async (
  wsUrl: string,
  payload: SkillUpsertInput,
): Promise<SkillDefinition> => {
  const response = await fetch(`${getAdminBaseUrl(wsUrl)}/api/skills`, {
    ...withCredentials,
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return readJson<SkillDefinition>(response);
};

export const deleteSkill = async (wsUrl: string, skillId: string): Promise<void> => {
  const response = await fetch(
    `${getAdminBaseUrl(wsUrl)}/api/skills/${encodeURIComponent(skillId)}`,
    {
      ...withCredentials,
      method: "DELETE",
    },
  );
  await readJson<{ success: boolean }>(response);
};

export const getSkillMarketStatus = async (wsUrl: string): Promise<SkillMarketStatus> => {
  const response = await fetch(
    `${getAdminBaseUrl(wsUrl)}/api/skills/market/status`,
    withCredentials,
  );
  return readJson<SkillMarketStatus>(response);
};

export const browseSkillMarket = async (
  wsUrl: string,
  params: {
    limit?: number;
    offset?: number;
    sort?: "score" | "stars" | "recent" | "composite";
    category?: string;
  } = {},
): Promise<SkillMarketItem[]> => {
  const searchParams = new URLSearchParams();
  if (params.limit !== undefined) {
    searchParams.set("limit", String(params.limit));
  }
  if (params.offset !== undefined) {
    searchParams.set("offset", String(params.offset));
  }
  if (params.sort) {
    searchParams.set("sort", params.sort);
  }
  if (params.category) {
    searchParams.set("category", params.category);
  }

  const response = await fetch(
    `${getAdminBaseUrl(wsUrl)}/api/skills/market/catalog${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
    withCredentials,
  );
  return readJson<SkillMarketItem[]>(response);
};

export const searchSkillMarket = async (
  wsUrl: string,
  payload: {
    query: string;
    limit?: number;
    category?: string;
    method?: "hybrid" | "embedding" | "fulltext";
  },
): Promise<SkillMarketItem[]> => {
  const response = await fetch(`${getAdminBaseUrl(wsUrl)}/api/skills/market/search`, {
    ...withCredentials,
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return readJson<SkillMarketItem[]>(response);
};

export const importSkillFromMarket = async (
  wsUrl: string,
  payload: Pick<SkillMarketItem, "id" | "slug" | "name" | "detailUrl">,
): Promise<SkillDefinition> => {
  const response = await fetch(`${getAdminBaseUrl(wsUrl)}/api/skills/market/import`, {
    ...withCredentials,
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return readJson<SkillDefinition>(response);
};

export const listAutomations = async (wsUrl: string): Promise<AutomationDefinition[]> => {
  const response = await fetch(`${getAdminBaseUrl(wsUrl)}/api/automations`, withCredentials);
  return readJson<AutomationDefinition[]>(response);
};

export const upsertAutomation = async (
  wsUrl: string,
  payload: AutomationUpsertInput,
): Promise<AutomationDefinition> => {
  const response = await fetch(`${getAdminBaseUrl(wsUrl)}/api/automations`, {
    ...withCredentials,
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return readJson<AutomationDefinition>(response);
};

export const deleteAutomation = async (wsUrl: string, automationId: string): Promise<void> => {
  const response = await fetch(
    `${getAdminBaseUrl(wsUrl)}/api/automations/${encodeURIComponent(automationId)}`,
    {
      ...withCredentials,
      method: "DELETE",
    },
  );
  await readJson<{ success: boolean }>(response);
};

export const runAutomation = async (
  wsUrl: string,
  automationId: string,
): Promise<AutomationDefinition> => {
  const response = await fetch(
    `${getAdminBaseUrl(wsUrl)}/api/automations/${encodeURIComponent(automationId)}/run`,
    {
      ...withCredentials,
      method: "POST",
    },
  );
  return readJson<AutomationDefinition>(response);
};

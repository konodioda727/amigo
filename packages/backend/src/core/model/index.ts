import { resolveModelConfig } from "./contextConfig";
import {
  getProviderResolutionErrorMessage,
  resolveProviderFromModelName,
} from "./providerModelMap";
import { GoogleGenAIProvider } from "./providers/googleGenAI";
import { OpenAICompatibleProvider } from "./providers/openaiCompatible";
import type { AmigoLlm, LlmFactory } from "./types";

export {
  listAvailableModels,
  resolveModelConfig,
  resolveModelContextConfig,
} from "./contextConfig";
export type {
  AmigoLlm,
  AmigoLlmStreamEvent,
  AmigoLlmStreamOptions,
  AmigoMessageContentPart,
  AmigoMessageRole,
  AmigoModelMessage,
  AmigoToolDefinition,
  KnownModelProvider,
  LlmFactory,
  ModelProvider,
} from "./types";
export { MODEL_PROVIDERS } from "./types";

let injectedLlmFactory: LlmFactory | null = null;

const readConfiguredDefaultModel = (): string | undefined => {
  const configuredDefault = process.env.MODEL_NAME?.trim();
  if (configuredDefault) {
    return configuredDefault;
  }

  return undefined;
};

const createDefaultLlm: LlmFactory = (options) => {
  const selectedConfig = options?.resolvedConfig;
  const selectedModel = selectedConfig?.model || options?.model?.trim();
  const modelName = selectedModel || readConfiguredDefaultModel() || "qwen3-coder";

  const temperature = Number(process.env.LLM_TEMPERATURE) || 0;
  const configuredModel =
    selectedConfig ||
    resolveModelConfig({
      model: modelName,
      ...(options?.configId ? { configId: options.configId } : {}),
    });
  const apiKey = configuredModel?.apiKey || process.env.MODEL_API_KEY;
  const provider = configuredModel?.provider || resolveProviderFromModelName(modelName);

  if (!apiKey) {
    throw new Error(`API key is required for model '${modelName}'`);
  }
  if (!provider) {
    throw new Error(getProviderResolutionErrorMessage(modelName));
  }

  if (provider === "google-genai") {
    return new GoogleGenAIProvider({
      configId: configuredModel?.configId,
      model: modelName,
      contextWindow: configuredModel?.contextWindow,
      thinkType: configuredModel?.thinkType,
      apiKey,
      temperature,
    });
  }

  if (provider === "openai-compatible") {
    return new OpenAICompatibleProvider({
      configId: configuredModel?.configId,
      model: modelName,
      contextWindow: configuredModel?.contextWindow,
      thinkType: configuredModel?.thinkType,
      apiKey,
      baseURL:
        configuredModel?.baseURL || process.env.MODEL_BASE_URL || "https://openrouter.ai/api/v1",
      temperature,
    });
  }

  throw new Error(`Unsupported provider '${provider}' for model '${modelName}'.`);
};

export const setLlmFactory = (factory?: LlmFactory): void => {
  injectedLlmFactory = factory || null;
};

export const getLlm = (options?: {
  model?: string;
  configId?: string;
  resolvedConfig?: {
    configId: string;
    model: string;
    provider: string;
    apiKey: string;
    baseURL?: string;
    contextWindow?: number;
    thinkType?: import("./contextConfig").ModelThinkType;
  };
}): AmigoLlm => {
  return (injectedLlmFactory || createDefaultLlm)(options);
};

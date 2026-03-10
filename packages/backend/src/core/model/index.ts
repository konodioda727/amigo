import { resolveModelConfig } from "./contextConfig";
import {
  getProviderResolutionErrorMessage,
  resolveProviderFromModelName,
} from "./providerModelMap";
import { GoogleGenAIProvider } from "./providers/googleGenAI";
import { OpenAICompatibleProvider } from "./providers/openaiCompatible";
import type { AmigoLlm, LlmFactory } from "./types";

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

const createDefaultLlm = (): AmigoLlm => {
  const apiKey = process.env.MODEL_API_KEY;
  const modelName = process.env.MODEL_NAME || "qwen3-coder";
  if (!apiKey) {
    throw new Error("MODEL_API_KEY environment variable is required");
  }

  const temperature = Number(process.env.LLM_TEMPERATURE) || 0;
  const configuredModel = resolveModelConfig(modelName);
  const provider = configuredModel?.provider || resolveProviderFromModelName(modelName);

  if (!provider) {
    throw new Error(getProviderResolutionErrorMessage(modelName));
  }

  if (provider === "google-genai") {
    return new GoogleGenAIProvider({
      model: modelName,
      apiKey,
      temperature,
    });
  }

  if (provider === "openai-compatible") {
    return new OpenAICompatibleProvider({
      model: modelName,
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

export const getLlm = (): AmigoLlm => {
  return (injectedLlmFactory || createDefaultLlm)();
};

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";

export type AmigoLlm = BaseChatModel;
export type LlmFactory = () => AmigoLlm;

let injectedLlmFactory: LlmFactory | null = null;

const createDefaultLlm = (): AmigoLlm => {
  const apiKey = process.env.MODEL_API_KEY;
  const modelName = process.env.MODEL_NAME || "qwen3-coder";
  if (!apiKey) {
    throw new Error("MODEL_API_KEY environment variable is required");
  }
  if (modelName.includes("gemini"))
    return new ChatGoogleGenerativeAI({
      model: modelName,
      temperature: 0,
      maxRetries: 2,
      apiKey,
    });

  return new ChatOpenAI({
    model: process.env.MODEL_NAME || "qwen3-coder",
    streaming: true,
    apiKey,
    configuration: {
      baseURL: process.env.MODEL_BASE_URL || "https://openrouter.ai/api/v1",
    },
    temperature: Number(process.env.LLM_TEMPERATURE) || 0,
  });
};

export const setLlmFactory = (factory?: LlmFactory): void => {
  injectedLlmFactory = factory || null;
};

export const getLlm = (): AmigoLlm => {
  return (injectedLlmFactory || createDefaultLlm)();
};

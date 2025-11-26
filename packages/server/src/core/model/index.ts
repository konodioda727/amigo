import { ChatOpenAI } from "@langchain/openai";

export const getLlm = () => {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY environment variable is required");
  }

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

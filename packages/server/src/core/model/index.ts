import { ChatOpenAI } from "@langchain/openai";

export const getLlm = () => {
  return new ChatOpenAI({
    model: "qwen/qwen3-235b-a22b:free",
    streaming: true,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: "***REMOVED***",
    },
    temperature: 0,
  });
};

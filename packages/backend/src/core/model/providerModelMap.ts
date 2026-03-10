import type { AmigoLlmProvider } from "./types";

type ModelProviderRule = {
  provider: AmigoLlmProvider;
  modelNamePatterns: RegExp[];
};

// Provider 与 modelName 的映射表。
// 新模型接入时请在这里补充匹配规则，避免隐式兜底路由到错误 provider。
const MODEL_PROVIDER_RULES: ModelProviderRule[] = [
  {
    provider: "google-genai",
    modelNamePatterns: [/^gemini(?:[-:/]|$)/i],
  },
  {
    provider: "openai-compatible",
    modelNamePatterns: [
      /^(?:qwen(?:\d+(?:\.\d+)*)?|gpt(?:-?\d+(?:\.\d+)*)?|o1|o3|o4|claude|deepseek|llama|mistral|gemma|glm|grok|command|jamba|phi|nemotron|yi|moonshot|doubao|minimax|baichuan|hunyuan|ernie|reka|kimi)(?:[-:/]|$)/i,
    ],
  },
];

const getModelNameCandidates = (modelName: string): string[] => {
  const normalized = modelName.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const modelSegment = normalized.includes("/")
    ? normalized.slice(normalized.lastIndexOf("/") + 1)
    : normalized;

  return Array.from(new Set([normalized, modelSegment]));
};

export const resolveProviderFromModelName = (modelName: string): AmigoLlmProvider | null => {
  const candidates = getModelNameCandidates(modelName);

  for (const rule of MODEL_PROVIDER_RULES) {
    for (const pattern of rule.modelNamePatterns) {
      if (candidates.some((candidate) => pattern.test(candidate))) {
        return rule.provider;
      }
    }
  }

  return null;
};

export const getProviderResolutionErrorMessage = (modelName: string): string => {
  const rulesSummary = MODEL_PROVIDER_RULES.map(
    (rule) =>
      `${rule.provider}: ${rule.modelNamePatterns.map((pattern) => pattern.source).join(", ")}`,
  ).join(" | ");

  return `Unsupported MODEL_NAME '${modelName}'. No provider matched in MODEL_PROVIDER_RULES. Please add a mapping rule. Current rules: ${rulesSummary}`;
};

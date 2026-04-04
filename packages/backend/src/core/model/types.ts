import type { ModelConfigSnapshot, ModelThinkType } from "./contextConfig";

export type AmigoMessageRole = "system" | "user" | "assistant";

export type AmigoMessageContentPart =
  | { type: "text"; text: string }
  | {
      type: "image" | "audio" | "video" | "file";
      url: string;
      mimeType?: string;
      name?: string;
      size?: number;
    };

export type AmigoModelMessage = {
  role: AmigoMessageRole;
  content: string | AmigoMessageContentPart[];
};

export type AmigoToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AmigoLlmStreamOptions = {
  signal?: AbortSignal;
  tools?: AmigoToolDefinition[];
};

export const MODEL_PROVIDERS = {
  OPENAI_COMPATIBLE: "openai-compatible",
  GOOGLE_GENAI: "google-genai",
} as const;

export type KnownModelProvider = (typeof MODEL_PROVIDERS)[keyof typeof MODEL_PROVIDERS];

export type ModelProvider = KnownModelProvider | (string & {});

export type AmigoLlmStreamEvent =
  | {
      type: "reasoning_delta";
      text: string;
    }
  | {
      type: "text_delta";
      text: string;
    }
  | {
      type: "tool_call_delta";
      toolCallId?: string;
      name?: string;
      argumentsText?: string;
      partialArguments?: Record<string, unknown>;
    }
  | {
      type: "tool_call_done";
      toolCallId?: string;
      name: string;
      arguments: Record<string, unknown>;
    };

export interface AmigoLlm {
  model: string;
  configId?: string;
  provider?: ModelProvider;
  contextWindow?: number;
  thinkType?: ModelThinkType;
  stream(
    messages: AmigoModelMessage[],
    options?: AmigoLlmStreamOptions,
  ): Promise<AsyncIterable<AmigoLlmStreamEvent>>;
}

export type LlmFactory = (options?: {
  model?: string;
  configId?: string;
  userId?: string;
  modelConfigSnapshot?: ModelConfigSnapshot;
  resolvedConfig?: {
    configId: string;
    model: string;
    provider: ModelProvider;
    apiKey?: string;
    baseURL?: string;
    contextWindow?: number;
    thinkType?: ModelThinkType;
  };
}) => AmigoLlm;

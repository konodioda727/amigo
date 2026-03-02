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

export type AmigoLlmProvider = "openai-compatible" | "google-genai" | (string & {});

export type AmigoLlmStreamEvent =
  | {
      type: "text_delta";
      text: string;
    }
  | {
      type: "tool_call_delta";
      toolCallId?: string;
      name?: string;
      argumentsText?: string;
    }
  | {
      type: "tool_call_done";
      toolCallId?: string;
      name: string;
      arguments: Record<string, unknown>;
    };

export interface AmigoLlm {
  provider?: AmigoLlmProvider;
  stream(
    messages: AmigoModelMessage[],
    options?: AmigoLlmStreamOptions,
  ): Promise<AsyncIterable<AmigoLlmStreamEvent>>;
}

export type LlmFactory = () => AmigoLlm;

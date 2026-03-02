import { streamSseData } from "../sse";
import type {
  AmigoLlm,
  AmigoLlmStreamEvent,
  AmigoLlmStreamOptions,
  AmigoMessageContentPart,
  AmigoModelMessage,
  AmigoToolDefinition,
} from "../types";

type OpenAIContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
      };
    };

type OpenAIMessage = {
  role: "system" | "user" | "assistant";
  content: string | OpenAIContentPart[];
};

type OpenAIProviderOptions = {
  model: string;
  apiKey: string;
  baseURL: string;
  temperature: number;
};

type OpenAIStreamToolCallDelta = {
  index?: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

const getFallbackAttachmentText = (part: Exclude<AmigoMessageContentPart, { type: "text" }>) => {
  const fileName = part.name ? `${part.name} ` : "";
  return `Attachment URL (${part.type}): ${fileName}${part.url}`.trim();
};

const toOpenAIContentPart = (part: AmigoMessageContentPart): OpenAIContentPart => {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }

  if (part.type === "image") {
    return {
      type: "image_url",
      image_url: {
        url: part.url,
      },
    };
  }

  return {
    type: "text",
    text: getFallbackAttachmentText(part),
  };
};

const toOpenAIMessages = (messages: AmigoModelMessage[]): OpenAIMessage[] => {
  return messages.map((message) => {
    if (typeof message.content === "string") {
      return {
        role: message.role,
        content: message.content,
      };
    }

    return {
      role: message.role,
      content: message.content.map(toOpenAIContentPart),
    };
  });
};

const toOpenAITools = (tools?: AmigoToolDefinition[]) => {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
};

const extractTextDelta = (deltaContent: unknown): string => {
  if (typeof deltaContent === "string") {
    return deltaContent;
  }

  if (Array.isArray(deltaContent)) {
    return deltaContent
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const record = part as Record<string, unknown>;
        return typeof record.text === "string" ? record.text : "";
      })
      .filter(Boolean)
      .join("");
  }

  return "";
};

const parseToolArguments = (argumentsText: string): Record<string, unknown> => {
  if (!argumentsText.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(argumentsText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

export class OpenAICompatibleProvider implements AmigoLlm {
  readonly provider = "openai-compatible" as const;

  private readonly completionsUrl: string;

  constructor(private readonly options: OpenAIProviderOptions) {
    const normalizedBaseUrl = options.baseURL.endsWith("/")
      ? options.baseURL
      : `${options.baseURL}/`;
    this.completionsUrl = new URL("chat/completions", normalizedBaseUrl).toString();
  }

  async stream(
    messages: AmigoModelMessage[],
    options?: AmigoLlmStreamOptions,
  ): Promise<AsyncIterable<AmigoLlmStreamEvent>> {
    const tools = toOpenAITools(options?.tools);
    const response = await fetch(this.completionsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.options.model,
        messages: toOpenAIMessages(messages),
        stream: true,
        temperature: this.options.temperature,
        tools,
        tool_choice: tools ? "auto" : undefined,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `OpenAI-compatible provider request failed (${response.status}): ${
          detail || response.statusText
        }`,
      );
    }

    if (!response.body) {
      throw new Error("OpenAI-compatible provider response body is empty");
    }

    const signal = options?.signal;
    const body = response.body;

    return {
      async *[Symbol.asyncIterator]() {
        const assembledToolCalls = new Map<
          number,
          { id?: string; name?: string; argumentsText: string; emitted: boolean }
        >();

        for await (const data of streamSseData(body, signal)) {
          if (data === "[DONE]") {
            break;
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }

          const payload = parsed as {
            choices?: Array<{
              delta?: {
                content?: unknown;
                tool_calls?: OpenAIStreamToolCallDelta[];
              };
              finish_reason?: string | null;
              text?: string;
            }>;
          };

          const firstChoice = payload.choices?.[0];
          if (!firstChoice) {
            continue;
          }

          const deltaContent = firstChoice.delta?.content ?? firstChoice.text;
          const text = extractTextDelta(deltaContent);
          if (text) {
            yield {
              type: "text_delta",
              text,
            };
          }

          const deltaToolCalls = firstChoice.delta?.tool_calls;
          if (Array.isArray(deltaToolCalls)) {
            for (const delta of deltaToolCalls) {
              const index = typeof delta.index === "number" ? delta.index : 0;
              const existing = assembledToolCalls.get(index) || {
                argumentsText: "",
                emitted: false,
              };

              if (typeof delta.id === "string" && delta.id) {
                existing.id = delta.id;
              }
              if (typeof delta.function?.name === "string" && delta.function.name) {
                existing.name = delta.function.name;
              }
              if (typeof delta.function?.arguments === "string" && delta.function.arguments) {
                existing.argumentsText += delta.function.arguments;
              }

              assembledToolCalls.set(index, existing);

              yield {
                type: "tool_call_delta",
                toolCallId: existing.id,
                name: existing.name,
                argumentsText: delta.function?.arguments,
              };
            }
          }

          // Do not emit tool_call_done on finish_reason immediately.
          // Some providers may still stream trailing argument fragments after declaring tool_calls.
          // We flush done events once stream fully ends to avoid truncated arguments.
        }

        for (const call of assembledToolCalls.values()) {
          if (call.emitted || !call.name) {
            continue;
          }
          yield {
            type: "tool_call_done",
            toolCallId: call.id,
            name: call.name,
            arguments: parseToolArguments(call.argumentsText),
          };
        }
      },
    };
  }
}

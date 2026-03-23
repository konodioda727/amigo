import type { ModelThinkType } from "../contextConfig";
import { streamSseData } from "../sse";
import type {
  AmigoLlm,
  AmigoLlmStreamEvent,
  AmigoLlmStreamOptions,
  AmigoMessageContentPart,
  AmigoModelMessage,
  AmigoToolDefinition,
} from "../types";

type GoogleGenAIProviderOptions = {
  configId?: string;
  model: string;
  contextWindow?: number;
  thinkType?: ModelThinkType;
  apiKey: string;
  temperature: number;
};

type InteractionContent =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image" | "audio" | "video" | "document";
      mime_type: string;
      uri: string;
    };

type InteractionTurn = {
  role: "user" | "model";
  content: string | InteractionContent[];
};

type GeminiToolCallState = {
  id?: string;
  name?: string;
  arguments: Record<string, unknown>;
};

type InteractionDelta =
  | {
      type?: "text";
      text?: string;
    }
  | {
      type?: "function_call";
      id?: string;
      name?: string;
      arguments?: unknown;
    }
  | {
      type?: "thought";
      thought?: string;
    }
  | {
      type?: "thought_summary";
      content?: {
        type?: string;
        text?: string;
      };
    }
  | {
      type?: string;
      [key: string]: unknown;
    };

const toToolArgumentsRecord = (args: unknown): Record<string, unknown> => {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return {};
};

const getGeminiToolCallKey = (
  functionCall: {
    id?: string;
    name?: string;
  },
  index: number,
): string => {
  if (typeof functionCall.id === "string" && functionCall.id) {
    return functionCall.id;
  }
  if (typeof functionCall.name === "string" && functionCall.name) {
    return `${functionCall.name}:${index}`;
  }
  return `tool:${index}`;
};

export const mergeGeminiToolCall = (
  existing: GeminiToolCallState | undefined,
  functionCall: {
    id?: string;
    name?: string;
    arguments?: unknown;
  },
): GeminiToolCallState => {
  return {
    id: typeof functionCall.id === "string" && functionCall.id ? functionCall.id : existing?.id,
    name:
      typeof functionCall.name === "string" && functionCall.name
        ? functionCall.name
        : existing?.name,
    arguments: toToolArgumentsRecord(functionCall.arguments),
  };
};

const toInteractionContent = (part: AmigoMessageContentPart): InteractionContent => {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }

  return {
    type: part.type === "file" ? "document" : part.type,
    mime_type: part.mimeType || "application/octet-stream",
    uri: part.url,
  };
};

const toInteractionContentArray = (
  content: AmigoModelMessage["content"],
): string | InteractionContent[] => {
  if (typeof content === "string") {
    return content;
  }
  return content.map(toInteractionContent);
};

const toInteractionToolDeclarations = (tools?: AmigoToolDefinition[]) => {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  return tools.map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
};

const getThoughtText = (delta: InteractionDelta): string | undefined => {
  if (delta.type === "thought" && typeof delta.thought === "string" && delta.thought) {
    return delta.thought;
  }

  if (
    delta.type === "thought_summary" &&
    delta.content &&
    typeof delta.content === "object" &&
    typeof (delta.content as any).text === "string" &&
    (delta.content as any).text
  ) {
    return (delta.content as any).text;
  }

  return undefined;
};

export class GoogleGenAIProvider implements AmigoLlm {
  readonly provider = "google-genai" as const;
  readonly model: string;
  readonly configId?: string;
  readonly contextWindow?: number;
  readonly thinkType?: ModelThinkType;

  constructor(private readonly options: GoogleGenAIProviderOptions) {
    this.model = options.model;
    this.configId = options.configId;
    this.contextWindow = options.contextWindow;
    this.thinkType = options.thinkType;
  }

  async stream(
    messages: AmigoModelMessage[],
    options?: AmigoLlmStreamOptions,
  ): Promise<AsyncIterable<AmigoLlmStreamEvent>> {
    const systemInstructions: string[] = [];
    const inputTurns: InteractionTurn[] = [];

    for (const message of messages) {
      if (message.role === "system") {
        const systemText =
          typeof message.content === "string"
            ? message.content
            : message.content
                .map((part) =>
                  part.type === "text" ? part.text : `[Attachment ${part.type}] ${part.url}`,
                )
                .join("\n");
        if (systemText.trim()) {
          systemInstructions.push(systemText);
        }
        continue;
      }

      inputTurns.push({
        role: message.role === "assistant" ? "model" : "user",
        content: toInteractionContentArray(message.content),
      });
    }

    const endpoint = "https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse";
    const tools = toInteractionToolDeclarations(options?.tools);

    const payload: Record<string, unknown> = {
      model: this.options.model,
      input: inputTurns,
      stream: true,
      store: false,
      generation_config: {
        temperature: this.options.temperature,
        thinking_summaries: "auto",
      },
    };

    if (tools) {
      payload.tools = tools;
    }

    if (systemInstructions.length > 0) {
      payload.system_instruction = systemInstructions.join("\n\n");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.options.apiKey,
      },
      body: JSON.stringify(payload),
      signal: options?.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Google GenAI provider request failed (${response.status}): ${detail || response.statusText}`,
      );
    }

    if (!response.body) {
      throw new Error("Google GenAI provider response body is empty");
    }

    const signal = options?.signal;
    const body = response.body;

    return {
      async *[Symbol.asyncIterator]() {
        const assembledToolCalls = new Map<string, GeminiToolCallState>();

        for await (const data of streamSseData(body, signal)) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }

          const event = parsed as {
            event_type?: string;
            delta?: InteractionDelta;
            error?: {
              message?: string;
            };
          };

          if (event.event_type === "error") {
            throw new Error(event.error?.message || "Google GenAI interactions stream error");
          }

          if (event.event_type !== "content.delta" || !event.delta) {
            continue;
          }

          const thoughtText = getThoughtText(event.delta);
          if (thoughtText) {
            yield {
              type: "reasoning_delta",
              text: thoughtText,
            };
            continue;
          }

          if (
            event.delta.type === "text" &&
            typeof event.delta.text === "string" &&
            event.delta.text
          ) {
            yield {
              type: "text_delta",
              text: event.delta.text,
            };
            continue;
          }

          if (event.delta.type !== "function_call" || !event.delta.name) {
            continue;
          }

          const toolCallKey = getGeminiToolCallKey(event.delta as any, assembledToolCalls.size);
          const merged = mergeGeminiToolCall(
            assembledToolCalls.get(toolCallKey),
            event.delta as any,
          );
          assembledToolCalls.set(toolCallKey, merged);

          yield {
            type: "tool_call_delta",
            toolCallId: merged.id,
            name: merged.name,
            argumentsText: JSON.stringify(merged.arguments),
            partialArguments: merged.arguments,
          };
        }

        for (const toolCall of assembledToolCalls.values()) {
          if (!toolCall.name) {
            continue;
          }

          yield {
            type: "tool_call_done",
            toolCallId: toolCall.id,
            name: toolCall.name,
            arguments: toolCall.arguments,
          };
        }
      },
    };
  }
}

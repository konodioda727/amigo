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
  model: string;
  apiKey: string;
  temperature: number;
};

type GeminiPart =
  | {
      text: string;
    }
  | {
      fileData: {
        mimeType: string;
        fileUri: string;
      };
    };

type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

const toGeminiPart = (part: AmigoMessageContentPart): GeminiPart => {
  if (part.type === "text") {
    return { text: part.text };
  }

  return {
    fileData: {
      mimeType: part.mimeType || "application/octet-stream",
      fileUri: part.url,
    },
  };
};

const toGeminiParts = (content: AmigoModelMessage["content"]): GeminiPart[] => {
  if (typeof content === "string") {
    return [{ text: content }];
  }
  return content.map(toGeminiPart);
};

const toGeminiToolDeclarations = (tools?: AmigoToolDefinition[]) => {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    },
  ];
};

export class GoogleGenAIProvider implements AmigoLlm {
  readonly provider = "google-genai" as const;

  constructor(private readonly options: GoogleGenAIProviderOptions) {}

  async stream(
    messages: AmigoModelMessage[],
    options?: AmigoLlmStreamOptions,
  ): Promise<AsyncIterable<AmigoLlmStreamEvent>> {
    const systemInstructions: string[] = [];
    const contents: GeminiContent[] = [];

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

      contents.push({
        role: message.role === "assistant" ? "model" : "user",
        parts: toGeminiParts(message.content),
      });
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.options.model,
    )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.options.apiKey)}`;

    const geminiTools = toGeminiToolDeclarations(options?.tools);

    const payload: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: this.options.temperature,
      },
    };

    if (geminiTools) {
      payload.tools = geminiTools;
      payload.toolConfig = {
        functionCallingConfig: {
          mode: "AUTO",
        },
      };
    }

    if (systemInstructions.length > 0) {
      payload.systemInstruction = {
        parts: [{ text: systemInstructions.join("\n\n") }],
      };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
        for await (const data of streamSseData(body, signal)) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }

          const payload = parsed as {
            candidates?: Array<{
              content?: {
                parts?: Array<{
                  text?: string;
                  functionCall?: {
                    id?: string;
                    name?: string;
                    args?: unknown;
                  };
                }>;
              };
            }>;
          };

          const firstCandidate = payload.candidates?.[0];
          const parts = firstCandidate?.content?.parts;
          if (!Array.isArray(parts)) {
            continue;
          }

          for (const part of parts) {
            if (typeof part?.text === "string" && part.text) {
              yield {
                type: "text_delta",
                text: part.text,
              };
            }

            const functionCall = part?.functionCall;
            if (!functionCall?.name) {
              continue;
            }
            const args =
              functionCall.args &&
              typeof functionCall.args === "object" &&
              !Array.isArray(functionCall.args)
                ? (functionCall.args as Record<string, unknown>)
                : {};

            yield {
              type: "tool_call_done",
              toolCallId: functionCall.id,
              name: functionCall.name,
              arguments: args,
            };
          }
        }
      },
    };
  }
}

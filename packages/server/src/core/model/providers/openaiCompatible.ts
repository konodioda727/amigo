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

const REASONING_PART_TYPES = new Set(["reasoning", "reasoning_text", "thinking", "thought"]);
const TEXT_PART_TYPES = new Set(["text", "output_text"]);

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const extractLooseText = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractLooseText(item)).join("");
  }

  const record = asRecord(value);
  if (!record) {
    return "";
  }

  const directTextFields = ["text", "content", "value", "output_text", "reasoning_text"] as const;
  for (const field of directTextFields) {
    if (typeof record[field] === "string") {
      return record[field] as string;
    }
  }

  const nestedFields = [
    "text",
    "content",
    "value",
    "output_text",
    "reasoning",
    "reasoning_content",
    "summary",
  ] as const;

  return nestedFields.map((field) => extractLooseText(record[field])).join("");
};

const extractContentDeltas = (deltaContent: unknown): { text: string; reasoning: string } => {
  if (typeof deltaContent === "string") {
    return { text: deltaContent, reasoning: "" };
  }

  const parts = Array.isArray(deltaContent) ? deltaContent : [deltaContent];
  let text = "";
  let reasoning = "";

  for (const part of parts) {
    const record = asRecord(part);
    if (!record) {
      continue;
    }

    const partType = typeof record.type === "string" ? record.type.toLowerCase() : "";
    const chunk = extractLooseText(
      record.text ??
        record.content ??
        record.value ??
        record.output_text ??
        record.reasoning_text ??
        "",
    );
    if (!chunk) {
      continue;
    }

    const markedReasoning = record.thought === true || record.reasoning === true;
    if (
      markedReasoning ||
      REASONING_PART_TYPES.has(partType) ||
      partType.includes("reasoning") ||
      partType.includes("thought")
    ) {
      reasoning += chunk;
      continue;
    }

    if (!partType || TEXT_PART_TYPES.has(partType)) {
      text += chunk;
      continue;
    }

    text += chunk;
  }

  return { text, reasoning };
};

const extractReasoningFromDelta = (
  delta?: {
    reasoning_content?: unknown;
    reasoning?: unknown;
  } | null,
): string => {
  if (!delta) {
    return "";
  }
  const reasoningContent = extractLooseText(delta.reasoning_content);
  const reasoning = extractLooseText(delta.reasoning);
  if (!reasoningContent) {
    return reasoning;
  }
  if (!reasoning) {
    return reasoningContent;
  }
  if (reasoningContent.includes(reasoning)) {
    return reasoningContent;
  }
  if (reasoning.includes(reasoningContent)) {
    return reasoning;
  }
  return `${reasoningContent}${reasoning}`;
};

const extractTextFallback = (value: unknown): string => {
  return extractLooseText(value);
};

const concatIfMissing = (base: string, extra: string): string => {
  if (!extra) {
    return base;
  }
  if (!base) {
    return extra;
  }
  if (base.includes(extra)) {
    return base;
  }
  if (extra.includes(base)) {
    return extra;
  }
  return `${base}${extra}`;
};

const extractTextDelta = (
  choice:
    | {
        delta?: {
          content?: unknown;
          reasoning_content?: unknown;
          reasoning?: unknown;
        };
        text?: string;
      }
    | null
    | undefined,
): { text: string; reasoning: string } => {
  if (!choice) {
    return { text: "", reasoning: "" };
  }

  const contentDeltas = extractContentDeltas(choice.delta?.content);
  const textFallback = choice.delta?.content === undefined ? extractTextFallback(choice.text) : "";
  const reasoningFromDelta = extractReasoningFromDelta(choice.delta);

  return {
    text: concatIfMissing(contentDeltas.text, textFallback),
    reasoning: concatIfMissing(contentDeltas.reasoning, reasoningFromDelta),
  };
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
    return parsePartialToolArguments(argumentsText);
  }
};

const parseJsonObject = (text: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
};

const getLastSignificantChar = (text: string): string | undefined => {
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch !== " " && ch !== "\n" && ch !== "\r" && ch !== "\t") {
      return ch;
    }
  }
  return undefined;
};

const stripTrailingComma = (text: string): string => {
  let result = text;
  while (true) {
    const trimmed = result.replace(/\s+$/, "");
    if (!trimmed.endsWith(",")) {
      return result;
    }
    result = trimmed.slice(0, -1);
  }
};

const repairJsonFragment = (raw: string): string => {
  const stack: Array<"{" | "[" | '"'> = [];
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        if (stack[stack.length - 1] === '"') {
          stack.pop();
        }
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      stack.push('"');
      out += ch;
      continue;
    }

    if (ch === "{") {
      stack.push("{");
      out += ch;
      continue;
    }

    if (ch === "[") {
      stack.push("[");
      out += ch;
      continue;
    }

    if (ch === "}") {
      if (stack[stack.length - 1] === "{") {
        out = stripTrailingComma(out);
        stack.pop();
        out += ch;
      }
      continue;
    }

    if (ch === "]") {
      if (stack[stack.length - 1] === "[") {
        out = stripTrailingComma(out);
        stack.pop();
        out += ch;
      }
      continue;
    }

    if (ch === ",") {
      const prev = getLastSignificantChar(out);
      if (!prev || prev === "{" || prev === "[" || prev === "," || prev === ":") {
        continue;
      }
      out += ch;
      continue;
    }

    out += ch;
  }

  while (stack.length > 0) {
    const symbol = stack.pop();
    if (symbol === '"') {
      out += '"';
      continue;
    }
    out = stripTrailingComma(out);
    out += symbol === "{" ? "}" : "]";
  }

  return stripTrailingComma(out).trim();
};

const parsePartialToolArguments = (argumentsText: string): Record<string, unknown> => {
  const text = argumentsText.trim();
  if (!text) {
    return {};
  }

  const start = text.indexOf("{");
  if (start === -1) {
    return {};
  }
  const fragment = text.slice(start);

  const direct = parseJsonObject(fragment);
  if (direct) {
    return direct;
  }

  const repaired = repairJsonFragment(fragment);
  const repairedParsed = parseJsonObject(repaired);
  if (repairedParsed) {
    return repairedParsed;
  }

  const maxBackoff = Math.min(fragment.length, 1024);
  for (let cut = 1; cut <= maxBackoff; cut++) {
    const candidate = fragment.slice(0, fragment.length - cut);
    const parsed = parseJsonObject(repairJsonFragment(candidate));
    if (parsed) {
      return parsed;
    }
  }

  return {};
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
                reasoning_content?: unknown;
                reasoning?: unknown;
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

          const { text, reasoning } = extractTextDelta(firstChoice);
          if (text) {
            yield {
              type: "text_delta",
              text,
            };
          }
          if (reasoning) {
            yield {
              type: "reasoning_delta",
              text: reasoning,
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
                partialArguments: parsePartialToolArguments(existing.argumentsText),
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

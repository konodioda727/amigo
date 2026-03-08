import { afterEach, describe, expect, it, mock } from "bun:test";
import { GoogleGenAIProvider } from "./googleGenAI";

const buildSseStream = (events: unknown[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  const chunks = events.map((event) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
};

describe("GoogleGenAIProvider", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should use interactions streaming and emit text, thinking, and tool call events", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        "https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse",
      );
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({
        "Content-Type": "application/json",
        "x-goog-api-key": "test-key",
      });

      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(payload.model).toBe("gemini-3-flash-preview");
      expect(payload.stream).toBe(true);
      expect(payload.store).toBe(false);
      expect(payload.system_instruction).toBe("system prompt");
      expect(payload.generation_config).toEqual({
        temperature: 0.2,
        thinking_summaries: "auto",
      });
      expect(payload.input).toEqual([
        { role: "user", content: "hello" },
        { role: "model", content: "hi" },
      ]);
      expect(payload.tools).toEqual([
        {
          type: "function",
          name: "get_weather",
          description: "Get weather",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string" },
            },
            required: ["location"],
          },
        },
      ]);

      return new Response(
        buildSseStream([
          {
            event_type: "content.delta",
            delta: {
              type: "thought",
              thought: "Need weather data.",
            },
          },
          {
            event_type: "content.delta",
            delta: {
              type: "text",
              text: "Checking now.",
            },
          },
          {
            event_type: "content.delta",
            delta: {
              type: "function_call",
              id: "call_1",
              name: "get_weather",
              arguments: {
                location: "Paris",
              },
            },
          },
          {
            event_type: "interaction.complete",
          },
        ]),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    });

    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const provider = new GoogleGenAIProvider({
      model: "gemini-3-flash-preview",
      apiKey: "test-key",
      temperature: 0.2,
    });

    const stream = await provider.stream(
      [
        { role: "system", content: "system prompt" },
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ],
      {
        tools: [
          {
            name: "get_weather",
            description: "Get weather",
            parameters: {
              type: "object",
              properties: {
                location: { type: "string" },
              },
              required: ["location"],
            },
          },
        ],
      },
    );

    const events: unknown[] = [];
    for await (const event of stream) {
      events.push(event);
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      {
        type: "reasoning_delta",
        text: "Need weather data.",
      },
      {
        type: "text_delta",
        text: "Checking now.",
      },
      {
        type: "tool_call_delta",
        toolCallId: "call_1",
        name: "get_weather",
        argumentsText: JSON.stringify({ location: "Paris" }),
        partialArguments: { location: "Paris" },
      },
      {
        type: "tool_call_done",
        toolCallId: "call_1",
        name: "get_weather",
        arguments: { location: "Paris" },
      },
    ]);
  });
});

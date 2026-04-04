import { afterEach, describe, expect, it, mock } from "bun:test";
import { OpenAICompatibleProvider } from "./openaiCompatible";

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

describe("OpenAICompatibleProvider", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("strips leaked think tags from streamed text deltas", async () => {
    const fetchMock = mock(async (input: string | Request | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.com/v1/chat/completions");
      expect(init?.method).toBe("POST");

      return new Response(
        buildSseStream([
          {
            choices: [
              {
                delta: {
                  content: "让我重新修复这个文件：</think>让我重新修复这个文件：<think>继续处理",
                },
              },
            ],
          },
        ]),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    });

    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const provider = new OpenAICompatibleProvider({
      model: "kimi-k2.5",
      apiKey: "test-key",
      baseURL: "https://example.com/v1",
      temperature: 0,
    });

    const stream = await provider.stream([{ role: "user", content: "hello" }]);

    const events: unknown[] = [];
    for await (const event of stream) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "text_delta",
        text: "让我重新修复这个文件：让我重新修复这个文件：继续处理",
      },
    ]);
  });

  it("serializes assistant tool calls and tool results into chat completion history", async () => {
    const fetchMock = mock(async (_input: string | Request | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(payload.messages).toEqual([
        { role: "system", content: "system prompt" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-readme",
              type: "function",
              function: {
                name: "readFile",
                arguments: JSON.stringify({ absolutePath: "/repo/README.md" }),
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call-readme",
          name: "readFile",
          content:
            '{"toolName":"readFile","result":{"absolutePath":"/repo/README.md","content":"# README"}}',
        },
      ]);

      return new Response(buildSseStream([]), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });

    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const provider = new OpenAICompatibleProvider({
      model: "kimi-k2.5",
      apiKey: "test-key",
      baseURL: "https://example.com/v1",
      temperature: 0,
    });

    const stream = await provider.stream([
      { role: "system", content: "system prompt" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call-readme",
            name: "readFile",
            arguments: { absolutePath: "/repo/README.md" },
          },
        ],
      },
      {
        role: "tool",
        toolCallId: "call-readme",
        toolName: "readFile",
        content:
          '{"toolName":"readFile","result":{"absolutePath":"/repo/README.md","content":"# README"}}',
      },
    ]);

    for await (const _event of stream) {
      // drain
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

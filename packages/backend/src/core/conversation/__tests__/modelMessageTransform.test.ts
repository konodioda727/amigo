import { describe, expect, it } from "bun:test";
import type { ChatMessage } from "@amigo-llm/types";
import { type AmigoLlm, MODEL_PROVIDERS } from "@/core/model";
import { toModelMessages } from "../modelMessageTransform";
import {
  buildAssistantToolCallMemoryMessage,
  buildToolResultMemoryMessage,
} from "../toolTranscript";

const createStubLlm = (): AmigoLlm => ({
  model: "test-model",
  provider: MODEL_PROVIDERS.OPENAI_COMPATIBLE,
  stream: async function* () {},
});

const createGoogleStubLlm = (): AmigoLlm => ({
  model: "gemini-test",
  provider: MODEL_PROVIDERS.GOOGLE_GENAI,
  stream: async function* () {},
});

describe("toModelMessages runtime datetime context", () => {
  it("appends current local datetime context to the latest user message", () => {
    const fixedNow = new Date("2026-03-23T10:15:30.000Z");
    const messages: ChatMessage[] = [
      {
        role: "user",
        type: "message",
        content: "6:50 提醒我",
        updateTime: fixedNow.getTime(),
      },
    ];

    const modelMessages = toModelMessages(messages, createStubLlm(), "BASE SYSTEM PROMPT");
    const firstMessage = modelMessages[0];
    const secondMessage = modelMessages[1];

    expect(firstMessage).toBeDefined();
    expect(firstMessage?.role).toBe("system");
    expect(String(firstMessage?.content)).toBe("BASE SYSTEM PROMPT");
    expect(secondMessage?.role).toBe("user");
    expect(String(secondMessage?.content)).toContain("6:50 提醒我");
    expect(String(secondMessage?.content)).toContain(
      "[系统自动附加的当前时间信息，仅用于解释这条用户消息中的时间表达]",
    );
    expect(String(secondMessage?.content)).toContain("2026-03-23");
    expect(String(secondMessage?.content)).toContain("10:15:30");
  });

  it("only augments the latest user message", () => {
    const firstUpdateTime = new Date("2026-03-22T09:00:00.000Z").getTime();
    const secondUpdateTime = new Date("2026-03-23T10:15:30.000Z").getTime();
    const messages: ChatMessage[] = [
      {
        role: "user",
        type: "message",
        content: "昨天的消息",
        updateTime: firstUpdateTime,
      },
      {
        role: "assistant",
        type: "message",
        content: "收到",
      },
      {
        role: "user",
        type: "message",
        content: "今天 6:50 提醒我",
        updateTime: secondUpdateTime,
      },
    ];

    const modelMessages = toModelMessages(messages, createStubLlm(), "SYSTEM PROMPT");

    expect(String(modelMessages[1]?.content)).toBe("昨天的消息");
    expect(String(modelMessages[3]?.content)).toContain("今天 6:50 提醒我");
    expect(String(modelMessages[3]?.content)).toContain("2026-03-23");
  });

  it("merges consecutive user text messages before sending them to the model", () => {
    const firstUpdateTime = new Date("2026-03-23T09:00:00.000Z").getTime();
    const secondUpdateTime = new Date("2026-03-23T10:15:30.000Z").getTime();
    const messages: ChatMessage[] = [
      {
        role: "user",
        type: "message",
        content: "先看一下 prompt",
        updateTime: firstUpdateTime,
      },
      {
        role: "user",
        type: "message",
        content: "再比较 roo-code 的实现",
        updateTime: secondUpdateTime,
      },
    ];

    const modelMessages = toModelMessages(messages, createStubLlm(), "SYSTEM PROMPT");

    expect(modelMessages).toHaveLength(2);
    expect(modelMessages[1]?.role).toBe("user");
    expect(String(modelMessages[1]?.content)).toContain("先看一下 prompt");
    expect(String(modelMessages[1]?.content)).toContain("再比较 roo-code 的实现");
    expect(String(modelMessages[1]?.content)).toContain("2026-03-23");
  });

  it("preserves attachments when merging consecutive user messages", () => {
    const messages: ChatMessage[] = [
      {
        role: "user",
        type: "message",
        content: "请结合这张图一起分析",
        updateTime: new Date("2026-03-23T09:00:00.000Z").getTime(),
      },
      {
        role: "user",
        type: "message",
        content: "",
        updateTime: new Date("2026-03-23T10:15:30.000Z").getTime(),
        attachments: [
          {
            kind: "image",
            mimeType: "image/png",
            url: "https://example.com/diagram.png",
            name: "diagram.png",
            size: 123,
          },
        ],
      },
    ];

    const modelMessages = toModelMessages(messages, createStubLlm(), "SYSTEM PROMPT");
    const mergedUserMessage = modelMessages[1];

    expect(Array.isArray(mergedUserMessage?.content)).toBe(true);
    if (!Array.isArray(mergedUserMessage?.content)) {
      throw new Error("expected merged content blocks");
    }

    expect(mergedUserMessage.content[0]).toMatchObject({
      type: "text",
    });
    expect(mergedUserMessage.content[1]).toMatchObject({
      type: "image",
      name: "diagram.png",
      url: "https://example.com/diagram.png",
    });
  });

  it("drops legacy plain-text loop reminder system messages before sending to the model", () => {
    const messages: ChatMessage[] = [
      {
        role: "system",
        type: "message",
        content: "提醒：本轮输出未调用任何工具，不能直接以普通 assistant 文本结束。",
        partial: false,
      },
      {
        role: "assistant",
        type: "message",
        content: "让我先确认当前文件内容。",
        partial: false,
      },
      {
        role: "system",
        type: "message",
        content:
          "提醒：你已经连续 2 轮只输出普通 assistant 文本，且没有任何工具调用；这属于无效续跑。",
        partial: false,
      },
      {
        role: "user",
        type: "userSendMessage",
        content: "继续",
        updateTime: new Date("2026-03-23T10:15:30.000Z").getTime(),
        partial: false,
      },
    ];

    const modelMessages = toModelMessages(messages, createStubLlm());

    expect(modelMessages).toHaveLength(2);
    expect(modelMessages[0]).toEqual({
      role: "assistant",
      content: "让我先确认当前文件内容。",
    });
    expect(modelMessages[1]?.role).toBe("user");
    expect(String(modelMessages[1]?.content)).toContain("继续");
  });

  it("serializes tool transcript messages into native tool-call history for openai-compatible models", () => {
    const messages: ChatMessage[] = [
      buildAssistantToolCallMemoryMessage({
        toolName: "readFile",
        toolCallId: "call-readme",
        arguments: { absolutePath: "/repo/README.md" },
      }),
      buildToolResultMemoryMessage({
        toolName: "readFile",
        toolCallId: "call-readme",
        result: {
          absolutePath: "/repo/README.md",
          content: "# README",
        },
        summary: "README 已读取",
      }),
    ];

    const modelMessages = toModelMessages(messages, createStubLlm());

    expect(modelMessages).toEqual([
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
        content: expect.stringContaining('"toolName": "readFile"'),
      },
    ]);
    expect(String(modelMessages[1]?.content)).toContain('"summary": "README 已读取"');
  });

  it("falls back to transcript text for tool history on google genai models", () => {
    const messages: ChatMessage[] = [
      buildAssistantToolCallMemoryMessage({
        toolName: "readFile",
        toolCallId: "call-readme",
        arguments: { absolutePath: "/repo/README.md" },
      }),
      buildToolResultMemoryMessage({
        toolName: "readFile",
        toolCallId: "call-readme",
        result: {
          absolutePath: "/repo/README.md",
          content: "# README",
        },
        summary: "README 已读取",
      }),
    ];

    const modelMessages = toModelMessages(messages, createGoogleStubLlm());

    expect(modelMessages).toEqual([
      {
        role: "assistant",
        content: expect.stringContaining('"kind": "assistant_tool_call"'),
      },
      {
        role: "user",
        content: expect.stringContaining('"toolName": "readFile"'),
      },
    ]);
  });

  it("collapses consecutive equivalent tool interactions before sending them to the model", () => {
    const messages: ChatMessage[] = [
      buildAssistantToolCallMemoryMessage({
        toolName: "readFile",
        toolCallId: "call-1",
        arguments: { absolutePath: "/repo/README.md" },
      }),
      buildToolResultMemoryMessage({
        toolName: "readFile",
        toolCallId: "call-1",
        result: { absolutePath: "/repo/README.md", content: "# README" },
        summary: "README 已读取",
      }),
      buildAssistantToolCallMemoryMessage({
        toolName: "readFile",
        toolCallId: "call-2",
        arguments: { absolutePath: "/repo/README.md" },
      }),
      buildToolResultMemoryMessage({
        toolName: "readFile",
        toolCallId: "call-2",
        result: { absolutePath: "/repo/README.md", content: "# README" },
        summary: "README 已读取",
      }),
    ];

    const modelMessages = toModelMessages(messages, createStubLlm());

    expect(modelMessages).toHaveLength(2);
    expect(modelMessages[0]).toMatchObject({
      role: "assistant",
      toolCalls: [
        {
          id: "call-2",
          name: "readFile",
        },
      ],
    });
    expect(modelMessages[1]).toMatchObject({
      role: "tool",
      toolCallId: "call-2",
    });
  });

  it("keeps only the most recent 10 tool interactions in full detail", () => {
    const messages: ChatMessage[] = Array.from({ length: 11 }, (_, index) => [
      buildAssistantToolCallMemoryMessage({
        toolName: "readFile",
        toolCallId: `call-${index + 1}`,
        arguments: { absolutePath: `/repo/file-${index + 1}.md` },
      }),
      buildToolResultMemoryMessage({
        toolName: "readFile",
        toolCallId: `call-${index + 1}`,
        result: {
          absolutePath: `/repo/file-${index + 1}.md`,
          content: `# file-${index + 1}`,
        },
        summary: `file-${index + 1} 已读取`,
      }),
    ]).flat();

    const modelMessages = toModelMessages(messages, createStubLlm());

    expect(modelMessages).toHaveLength(22);
    expect(modelMessages[0]).toEqual({
      role: "assistant",
      content: "【已调用 readFile 工具】",
    });
    expect(modelMessages[1]).toEqual({
      role: "user",
      content: "【readFile 工具已返回结果】",
    });
    expect(modelMessages[2]).toMatchObject({
      role: "assistant",
      toolCalls: [
        {
          id: "call-2",
          name: "readFile",
          arguments: { absolutePath: "/repo/file-2.md" },
        },
      ],
    });
    expect(modelMessages[3]).toMatchObject({
      role: "tool",
      toolCallId: "call-2",
      toolName: "readFile",
    });
    expect(modelMessages.at(-2)).toMatchObject({
      role: "assistant",
      toolCalls: [
        {
          id: "call-11",
          name: "readFile",
        },
      ],
    });
    expect(modelMessages.at(-1)).toMatchObject({
      role: "tool",
      toolCallId: "call-11",
      toolName: "readFile",
    });
  });
});

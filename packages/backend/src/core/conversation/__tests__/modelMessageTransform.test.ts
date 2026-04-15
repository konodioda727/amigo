import { describe, expect, it } from "bun:test";
import type { ChatMessage } from "@amigo-llm/types";
import { type AmigoLlm, MODEL_PROVIDERS } from "@/core/model";
import { toModelMessages } from "../context/modelMessageTransform";
import {
  buildAssistantToolCallMemoryMessage,
  buildToolResultMemoryMessage,
} from "../context/toolTranscript";

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

  it("does not append runtime datetime context onto workflow-state reminder messages", () => {
    const updateTime = new Date("2026-03-23T10:15:30.000Z").getTime();
    const messages: ChatMessage[] = [
      {
        role: "user",
        type: "system",
        content: "[WorkflowState]\n当前阶段：requirements",
        updateTime,
      },
    ];

    const modelMessages = toModelMessages(messages, createStubLlm(), "SYSTEM PROMPT");

    expect(modelMessages).toHaveLength(2);
    expect(modelMessages[1]?.role).toBe("user");
    expect(String(modelMessages[1]?.content)).toBe("[WorkflowState]\n当前阶段：requirements");
    expect(String(modelMessages[1]?.content)).not.toContain(
      "[系统自动附加的当前时间信息，仅用于解释这条用户消息中的时间表达]",
    );
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

  it("serializes listFiles tool results as a file tree for openai-compatible models", () => {
    const messages: ChatMessage[] = [
      buildAssistantToolCallMemoryMessage({
        toolName: "listFiles",
        toolCallId: "call-tree",
        arguments: { directoryPath: "src" },
      }),
      buildToolResultMemoryMessage({
        toolName: "listFiles",
        toolCallId: "call-tree",
        result: {
          success: true,
          directoryPath: "src",
          tree: ["src/", "├── components/", "└── index.ts"].join("\n"),
          entries: [
            { path: "src/components", name: "components", type: "directory", depth: 1 },
            { path: "src/index.ts", name: "index.ts", type: "file", depth: 1 },
          ],
          truncated: false,
          maxDepth: 2,
          includeHidden: false,
          maxEntries: 200,
          message: "已列出目录 src，共 2 项",
        },
        summary: "src 已列出",
      }),
    ];

    const modelMessages = toModelMessages(messages, createStubLlm());
    expect(modelMessages[1]).toEqual({
      role: "tool",
      toolCallId: "call-tree",
      toolName: "listFiles",
      content: expect.stringContaining("tree:\nsrc/\n├── components/\n└── index.ts"),
    });
    expect(String(modelMessages[1]?.content)).toContain("summary: src 已列出");
    expect(String(modelMessages[1]?.content)).not.toContain('"entries"');
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

  it("keeps assistant messages between duplicate tool interactions even when older duplicates are collapsed", () => {
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
      {
        role: "assistant",
        type: "message",
        content: "我已经看过 README 了，再继续比对其他文件。",
      },
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

    expect(modelMessages).toHaveLength(3);
    expect(modelMessages[0]).toEqual({
      role: "assistant",
      content: "我已经看过 README 了，再继续比对其他文件。",
    });
    expect(modelMessages[0]).toMatchObject({
      role: "assistant",
      content: "我已经看过 README 了，再继续比对其他文件。",
    });
    expect(modelMessages[1]).toMatchObject({
      role: "assistant",
      toolCalls: [
        {
          id: "call-2",
          name: "readFile",
        },
      ],
    });
    expect(modelMessages[2]).toMatchObject({
      role: "tool",
      toolCallId: "call-2",
      toolName: "readFile",
    });
  });

  it("keeps at most 50 detailed tool messages after collapsing duplicates", () => {
    const messages: ChatMessage[] = Array.from({ length: 26 }, (_, index) => [
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

    expect(modelMessages).toHaveLength(50);
    expect(modelMessages[0]).toMatchObject({
      role: "assistant",
      toolCalls: [
        {
          id: "call-2",
          name: "readFile",
          arguments: { absolutePath: "/repo/file-2.md" },
        },
      ],
    });
    expect(modelMessages[1]).toMatchObject({
      role: "tool",
      toolCallId: "call-2",
      toolName: "readFile",
    });
    expect(modelMessages.at(-2)).toMatchObject({
      role: "assistant",
      toolCalls: [
        {
          id: "call-26",
          name: "readFile",
        },
      ],
    });
    expect(modelMessages.at(-1)).toMatchObject({
      role: "tool",
      toolCallId: "call-26",
      toolName: "readFile",
    });
  });

  it("keeps assistant progress messages that sit between tool interactions", () => {
    const messages: ChatMessage[] = [
      buildAssistantToolCallMemoryMessage({
        toolName: "readFile",
        toolCallId: "call-1",
        arguments: { absolutePath: "/repo/a.ts" },
      }),
      buildToolResultMemoryMessage({
        toolName: "readFile",
        toolCallId: "call-1",
        result: { absolutePath: "/repo/a.ts", content: "export const a = 1;" },
        summary: "a.ts 已读取",
      }),
      {
        role: "assistant",
        type: "message",
        content: "我先看看下一个文件。",
      },
      buildAssistantToolCallMemoryMessage({
        toolName: "readFile",
        toolCallId: "call-2",
        arguments: { absolutePath: "/repo/b.ts" },
      }),
      buildToolResultMemoryMessage({
        toolName: "readFile",
        toolCallId: "call-2",
        result: { absolutePath: "/repo/b.ts", content: "export const b = 2;" },
        summary: "b.ts 已读取",
      }),
    ];

    const modelMessages = toModelMessages(messages, createStubLlm());

    expect(modelMessages).toHaveLength(5);
    expect(modelMessages[2]).toEqual({
      role: "assistant",
      content: "我先看看下一个文件。",
    });
  });

  it("keeps assistant messages that add new facts even when they sit near tool interactions", () => {
    const messages: ChatMessage[] = [
      buildAssistantToolCallMemoryMessage({
        toolName: "readFile",
        toolCallId: "call-1",
        arguments: { absolutePath: "/repo/a.ts" },
      }),
      buildToolResultMemoryMessage({
        toolName: "readFile",
        toolCallId: "call-1",
        result: { absolutePath: "/repo/a.ts", content: "export const platform = 'web';" },
        summary: "a.ts 已读取",
      }),
      {
        role: "assistant",
        type: "message",
        content: "已确认问题只影响 web 端，不涉及原生端。",
      },
      buildAssistantToolCallMemoryMessage({
        toolName: "readFile",
        toolCallId: "call-2",
        arguments: { absolutePath: "/repo/b.ts" },
      }),
      buildToolResultMemoryMessage({
        toolName: "readFile",
        toolCallId: "call-2",
        result: { absolutePath: "/repo/b.ts", content: "export const b = 2;" },
        summary: "b.ts 已读取",
      }),
    ];

    const modelMessages = toModelMessages(messages, createStubLlm());

    expect(modelMessages).toHaveLength(5);
    expect(modelMessages[2]).toEqual({
      role: "assistant",
      content: "已确认问题只影响 web 端，不涉及原生端。",
    });
  });
});

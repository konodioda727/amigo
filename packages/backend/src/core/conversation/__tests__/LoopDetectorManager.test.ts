import { describe, expect, it } from "bun:test";
import type { ChatMessage } from "@amigo-llm/types";
import { __testing__, loopDetectorManager } from "../LoopDetectorManager";
import {
  buildAssistantToolCallMemoryMessage,
  buildToolResultMemoryMessage,
} from "../toolTranscript";

const createInteractionMessages = (params: {
  toolCallId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  summary?: string;
  isError?: boolean;
  error?: string;
}): ChatMessage[] => [
  buildAssistantToolCallMemoryMessage({
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    arguments: params.arguments || {},
  }),
  buildToolResultMemoryMessage({
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    result: params.result,
    summary: params.summary,
    isError: params.isError,
    error: params.error,
  }),
];

describe("LoopDetectorManager", () => {
  it("detects repeated identical tool interactions", () => {
    const messages: ChatMessage[] = [
      ...createInteractionMessages({
        toolCallId: "call-1",
        toolName: "readFile",
        arguments: { filePaths: ["README.md"] },
        result: { filePaths: ["README.md"] },
        summary: "README 已读取",
      }),
      ...createInteractionMessages({
        toolCallId: "call-2",
        toolName: "readFile",
        arguments: { filePaths: ["README.md"] },
        result: { filePaths: ["README.md"] },
        summary: "README 已读取",
      }),
    ];

    const detection = loopDetectorManager.detect(messages);

    expect(detection).toEqual({
      kind: "repeated_same_interaction",
      toolName: "readFile",
      count: 2,
    });
  });

  it("detects repeated reads of the same resource", () => {
    const messages: ChatMessage[] = [
      ...createInteractionMessages({
        toolCallId: "call-1",
        toolName: "readFile",
        arguments: { filePaths: ["README.md"] },
        result: { filePaths: ["README.md"] },
        summary: "README 已读取",
      }),
      ...createInteractionMessages({
        toolCallId: "call-2",
        toolName: "readFile",
        arguments: { filePaths: ["README.md"] },
        result: { filePaths: ["README.md"] },
        summary: "README 已读取",
      }),
      ...createInteractionMessages({
        toolCallId: "call-3",
        toolName: "readFile",
        arguments: { filePaths: ["README.md"] },
        result: { filePaths: ["README.md"] },
        summary: "README 已读取",
      }),
    ];

    const detection = __testing__.detectRepeatedResourceReads(
      __testing__.collectToolInteractions(messages),
    );

    expect(detection).toEqual({
      kind: "resource_read_loop",
      toolName: "readFile",
      resourceKey: "file:README.md",
      count: 3,
    });
  });

  it("detects tool oscillation without state progress", () => {
    const messages: ChatMessage[] = [
      ...createInteractionMessages({
        toolCallId: "call-1",
        toolName: "readFile",
        arguments: { filePaths: ["README.md"] },
        result: { filePaths: ["README.md"] },
        summary: "README 已读取",
      }),
      ...createInteractionMessages({
        toolCallId: "call-2",
        toolName: "browserSearch",
        arguments: { query: "roo-code prompt" },
        result: { results: [{ title: "roo" }] },
        summary: "搜索完成",
      }),
      ...createInteractionMessages({
        toolCallId: "call-3",
        toolName: "readFile",
        arguments: { filePaths: ["README.md"] },
        result: { filePaths: ["README.md"] },
        summary: "README 已读取",
      }),
      ...createInteractionMessages({
        toolCallId: "call-4",
        toolName: "browserSearch",
        arguments: { query: "roo-code prompt" },
        result: { results: [{ title: "roo" }] },
        summary: "搜索完成",
      }),
    ];

    const detection = __testing__.detectToolOscillation(
      __testing__.collectToolInteractions(messages),
    );

    expect(detection).toEqual({
      kind: "tool_oscillation",
      cycle: ["readFile", "browserSearch"],
      count: 4,
    });
  });

  it("detects no-progress windows without writes or new facts", () => {
    const messages: ChatMessage[] = [
      ...createInteractionMessages({
        toolCallId: "call-1",
        toolName: "readFile",
        arguments: { filePaths: ["README.md"] },
        result: { filePaths: ["README.md"] },
        summary: "README 已读取",
      }),
      ...createInteractionMessages({
        toolCallId: "call-2",
        toolName: "browserSearch",
        arguments: { query: "roo-code prompt" },
        result: { results: [{ title: "roo" }] },
        summary: "搜索完成",
      }),
      ...createInteractionMessages({
        toolCallId: "call-3",
        toolName: "readFile",
        arguments: { filePaths: ["README.md"] },
        result: { filePaths: ["README.md"] },
        summary: "README 已读取",
      }),
      ...createInteractionMessages({
        toolCallId: "call-4",
        toolName: "browserSearch",
        arguments: { query: "roo-code prompt" },
        result: { results: [{ title: "roo" }] },
        summary: "搜索完成",
      }),
    ];

    const detection = __testing__.detectNoProgress(__testing__.collectToolInteractions(messages));

    expect(detection).toEqual({
      kind: "no_progress",
      toolNames: ["readFile", "browserSearch"],
      count: 4,
    });
  });

  it("builds api-only retry guidance from detection", () => {
    const messages: ChatMessage[] = [
      ...createInteractionMessages({
        toolCallId: "call-1",
        toolName: "readFile",
        arguments: { filePaths: ["README.md"] },
        result: { filePaths: ["README.md"] },
        summary: "README 已读取",
      }),
      ...createInteractionMessages({
        toolCallId: "call-2",
        toolName: "readFile",
        arguments: { filePaths: ["README.md"] },
        result: { filePaths: ["README.md"] },
        summary: "README 已读取",
      }),
    ];

    const retryMessages = loopDetectorManager.buildRetryMessages({
      memory: { messages },
    } as never);

    expect(retryMessages).toEqual([
      expect.objectContaining({
        role: "system",
        type: "message",
        partial: false,
        content: expect.stringContaining("不要再次调用相同工具和参数"),
      }),
    ]);
  });
});

import { describe, expect, it } from "bun:test";
import type { ChatMessage } from "@amigo-llm/types";
import { __testing__, loopDetectorManager } from "../context/LoopDetectorManager";
import {
  buildAssistantToolCallMemoryMessage,
  buildToolResultMemoryMessage,
} from "../context/toolTranscript";

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

  it("detects detours after a tool error instead of retrying the same tool", () => {
    const messages: ChatMessage[] = [
      ...createInteractionMessages({
        toolCallId: "call-1",
        toolName: "editFile",
        arguments: { filePath: "plugin/src/index.ts" },
        isError: true,
        error: "工具 'editFile' 缺少必需参数: newString",
        summary: "editFile 调用失败",
      }),
      ...createInteractionMessages({
        toolCallId: "call-2",
        toolName: "readFile",
        arguments: { filePaths: ["plugin/src/index.ts"] },
        result: { filePaths: ["plugin/src/index.ts"] },
        summary: "index 已读取",
      }),
      ...createInteractionMessages({
        toolCallId: "call-3",
        toolName: "bash",
        arguments: { command: 'rg -n "index" plugin/src' },
        result: { output: "plugin/src/index.ts:1:export {};", exitCode: 0 },
        summary: "grep 完成",
      }),
    ];

    const detection = __testing__.detectToolErrorDetour(
      __testing__.collectToolInteractions(messages),
    );

    expect(detection).toEqual({
      kind: "tool_error_detour",
      failedToolName: "editFile",
      detourToolNames: ["readFile", "bash"],
      count: 2,
    });
  });

  it("detects repeated symbol grep loops and extracts likely symbol names", () => {
    const messages: ChatMessage[] = [
      ...createInteractionMessages({
        toolCallId: "call-1",
        toolName: "bash",
        arguments: {
          command:
            'rg -n "getProjectVendorFlags|LEGACY_PROJECT_BUILD_TAGS|getBuildscriptRepositories" plugin/src',
        },
        result: {
          output:
            "plugin/src/android/projectBuildGradle.ts:46:  const vendorFlags = getProjectVendorFlags();",
          exitCode: 0,
        },
        summary: "symbol grep 完成",
      }),
      ...createInteractionMessages({
        toolCallId: "call-2",
        toolName: "bash",
        arguments: {
          command:
            'rg -n "getProjectVendorFlags|getBuildscriptRepositories|LEGACY_PROJECT|vendorFlags" plugin/src',
        },
        result: {
          output:
            "plugin/src/android/projectBuildGradle.ts:82:  const buildscriptRepositories = getBuildscriptRepositories();",
          exitCode: 0,
        },
        summary: "symbol grep 完成",
      }),
    ];

    const detection = __testing__.detectSymbolSearchLoop(
      __testing__.collectToolInteractions(messages),
    );

    expect(detection).toEqual({
      kind: "symbol_search_loop",
      count: 2,
      toolNames: ["bash"],
      symbolNames: [
        "getProjectVendorFlags",
        "getBuildscriptRepositories",
        "LEGACY_PROJECT",
        "vendorFlags",
        "LEGACY_PROJECT_BUILD_TAGS",
      ],
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

  it("reminds only after five read/search interactions without progress", () => {
    const messages: ChatMessage[] = [
      ...createInteractionMessages({
        toolCallId: "call-1",
        toolName: "listFiles",
        arguments: { directoryPath: "/repo/src" },
        result: { directoryPath: "/repo/src" },
        summary: "src 已列出",
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
        toolName: "browserSearch",
        arguments: { query: "amigo workflow" },
        result: { results: [{ title: "workflow" }] },
        summary: "搜索完成",
      }),
      ...createInteractionMessages({
        toolCallId: "call-4",
        toolName: "readRules",
        arguments: { ids: ["coding"] },
        result: { ids: ["coding"] },
        summary: "规则已读取",
      }),
      ...createInteractionMessages({
        toolCallId: "call-5",
        toolName: "readFile",
        arguments: { filePaths: ["design.md"] },
        result: { filePaths: ["design.md"] },
        summary: "design 已读取",
      }),
    ];

    const detection = __testing__.detectReadWithoutProgress(
      __testing__.collectToolInteractions(messages),
    );

    expect(detection).toEqual({
      kind: "read_without_progress",
      toolNames: ["listFiles", "readFile", "browserSearch", "readRules"],
      count: 5,
    });
  });

  it("does not remind after only two read/search interactions", () => {
    const messages: ChatMessage[] = [
      ...createInteractionMessages({
        toolCallId: "call-1",
        toolName: "listFiles",
        arguments: { directoryPath: "/repo/src" },
        result: { directoryPath: "/repo/src" },
        summary: "src 已列出",
      }),
      ...createInteractionMessages({
        toolCallId: "call-2",
        toolName: "readFile",
        arguments: { filePaths: ["README.md"] },
        result: { filePaths: ["README.md"] },
        summary: "README 已读取",
      }),
    ];

    const detection = __testing__.detectReadWithoutProgress(
      __testing__.collectToolInteractions(messages),
    );

    expect(detection).toBeNull();
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
        role: "user",
        type: "message",
        partial: false,
        content: expect.stringContaining("不要再次调用相同工具和参数"),
      }),
    ]);
  });

  it("targets taskList execution next steps in read-without-write guidance", () => {
    const messages: ChatMessage[] = [
      ...createInteractionMessages({
        toolCallId: "call-1",
        toolName: "listFiles",
        arguments: { directoryPath: "/repo/src" },
        result: { directoryPath: "/repo/src" },
        summary: "src 已列出",
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
        toolName: "browserSearch",
        arguments: { query: "design workflow" },
        result: { results: [{ title: "workflow" }] },
        summary: "搜索完成",
      }),
      ...createInteractionMessages({
        toolCallId: "call-4",
        toolName: "readRules",
        arguments: { ids: ["coding"] },
        result: { ids: ["coding"] },
        summary: "规则已读取",
      }),
      ...createInteractionMessages({
        toolCallId: "call-5",
        toolName: "readFile",
        arguments: { filePaths: ["design.md"] },
        result: { filePaths: ["design.md"] },
        summary: "design 已读取",
      }),
    ];

    const retryMessages = loopDetectorManager.buildRetryMessages({
      currentWorkflowPhase: "design",
      workflowAgentRole: "controller",
      memory: { messages },
    } as never);

    expect(retryMessages).toEqual([
      expect.objectContaining({
        role: "user",
        type: "message",
        partial: false,
        content: expect.stringContaining("taskList（action=execute，必要时连 tasks 一起传入）"),
      }),
    ]);
  });

  it("pushes execution workers from repeated reads toward editFile", () => {
    const messages: ChatMessage[] = [
      ...createInteractionMessages({
        toolCallId: "call-1",
        toolName: "readFile",
        arguments: { filePaths: ["plugin/src/index.ts"] },
        result: { filePaths: ["plugin/src/index.ts"] },
        summary: "index 已读取",
      }),
      ...createInteractionMessages({
        toolCallId: "call-2",
        toolName: "readFile",
        arguments: { filePaths: ["plugin/src/index.ts"] },
        result: { filePaths: ["plugin/src/index.ts"] },
        summary: "index 已读取",
      }),
      ...createInteractionMessages({
        toolCallId: "call-3",
        toolName: "readFile",
        arguments: { filePaths: ["plugin/src/index.ts"] },
        result: { filePaths: ["plugin/src/index.ts"] },
        summary: "index 已读取",
      }),
    ];

    const retryMessages = loopDetectorManager.buildRetryMessages({
      currentWorkflowPhase: "execution",
      workflowAgentRole: "execution_worker",
      memory: { messages },
    } as never);

    expect(retryMessages).toEqual([
      expect.objectContaining({
        content: expect.stringContaining("editFile"),
      }),
    ]);
    expect(retryMessages?.[0]?.content).toContain("先落当前这一处");
  });

  it("pushes repeated symbol grep loops toward LSP navigation", () => {
    const messages: ChatMessage[] = [
      ...createInteractionMessages({
        toolCallId: "call-1",
        toolName: "bash",
        arguments: {
          command:
            'rg -n "getProjectVendorFlags|LEGACY_PROJECT_BUILD_TAGS|getBuildscriptRepositories" plugin/src',
        },
        result: {
          output:
            "plugin/src/android/projectBuildGradle.ts:46:  const vendorFlags = getProjectVendorFlags();",
          exitCode: 0,
        },
        summary: "symbol grep 完成",
      }),
      ...createInteractionMessages({
        toolCallId: "call-2",
        toolName: "bash",
        arguments: {
          command:
            'rg -n "getProjectVendorFlags|getBuildscriptRepositories|LEGACY_PROJECT|vendorFlags" plugin/src',
        },
        result: {
          output:
            "plugin/src/android/projectBuildGradle.ts:82:  const buildscriptRepositories = getBuildscriptRepositories();",
          exitCode: 0,
        },
        summary: "symbol grep 完成",
      }),
    ];

    const retryMessages = loopDetectorManager.buildRetryMessages({
      currentWorkflowPhase: "execution",
      workflowAgentRole: "execution_worker",
      memory: { messages },
    } as never);

    expect(retryMessages).toEqual([
      expect.objectContaining({
        content: expect.stringContaining("goToDefinition / findReferences / getDiagnostics"),
      }),
    ]);
    expect(retryMessages?.[0]?.content).toContain("先 editFile 落这一处");
  });

  it("pushes tool-error detours back to retrying the same tool", () => {
    const messages: ChatMessage[] = [
      ...createInteractionMessages({
        toolCallId: "call-1",
        toolName: "editFile",
        arguments: { filePath: "plugin/src/index.ts" },
        isError: true,
        error: "工具 'editFile' 缺少必需参数: newString",
        summary: "editFile 调用失败",
      }),
      ...createInteractionMessages({
        toolCallId: "call-2",
        toolName: "readFile",
        arguments: { filePaths: ["plugin/src/index.ts"] },
        result: { filePaths: ["plugin/src/index.ts"] },
        summary: "index 已读取",
      }),
    ];

    const retryMessages = loopDetectorManager.buildRetryMessages({
      currentWorkflowPhase: "execution",
      workflowAgentRole: "controller",
      memory: { messages },
    } as never);

    expect(retryMessages).toEqual([
      expect.objectContaining({
        content: expect.stringContaining("重试 editFile"),
      }),
    ]);
    expect(retryMessages?.[0]?.content).toContain("不要因为一次工具报错就立刻换路径");
  });
});

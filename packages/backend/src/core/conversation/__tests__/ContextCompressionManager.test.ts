import { beforeEach, describe, expect, it } from "bun:test";
import type { ChatMessage } from "@amigo-llm/types";
import { setGlobalState } from "@/globalState";
import type { Conversation } from "../Conversation";
import { __testing__ } from "../context/ContextCompressionManager";

const createMessage = (
  updateTime: number,
  content: string,
  role: ChatMessage["role"] = "user",
): ChatMessage => ({
  role,
  type: role === "user" ? "userSendMessage" : "message",
  content,
  updateTime,
});

describe("ContextCompressionManager helpers", () => {
  beforeEach(() => {
    setGlobalState("modelConfigs", undefined);
    setGlobalState("modelContextConfigs", undefined);
  });

  it("keeps only the latest compression marker and later messages in active context", () => {
    const messages: ChatMessage[] = [
      createMessage(1, "old-1"),
      createMessage(2, "old-2"),
      {
        role: "system",
        type: "compaction",
        content: "compressed summary",
        updateTime: 3,
      },
      createMessage(4, "recent-1"),
      createMessage(5, "recent-2", "assistant"),
    ];

    const selected = __testing__.getMessagesForCurrentContext(messages);

    expect(selected.map((message) => message.updateTime)).toEqual([3, 4, 5]);
  });

  it("chooses an older prefix to compress while preserving recent messages", () => {
    const messages: ChatMessage[] = [
      createMessage(1, "task start"),
      createMessage(2, "repo scan"),
      createMessage(3, "tool result", "assistant"),
      createMessage(4, "follow up"),
      createMessage(5, "final constraint"),
    ];

    const split = __testing__.decideCompressionSplit(messages, 30, 2, 2);

    expect(split).not.toBeNull();
    expect(split?.messagesToCompress.map((message) => message.updateTime)).toEqual([1, 2]);
    expect(split?.keepStartIndex).toBe(2);
  });

  it("uses the latest compaction message as the active context anchor", () => {
    const messages: ChatMessage[] = [
      createMessage(1, "old-1"),
      {
        role: "system",
        type: "compaction",
        content: "older summary",
        updateTime: 2,
      },
      createMessage(3, "recent-1"),
      {
        role: "system",
        type: "compaction",
        content: "newer summary",
        updateTime: 4,
      },
      createMessage(5, "recent-2", "assistant"),
    ];

    const selected = __testing__.getMessagesForCurrentContext(messages);

    expect(selected.map((message) => message.updateTime)).toEqual([4, 5]);
  });

  it("uses the latest checkpoint message as the active context anchor", () => {
    const messages: ChatMessage[] = [
      createMessage(1, "old-1"),
      {
        role: "system",
        type: "checkpoint",
        content: "[Checkpoint]\n摘要：requirements done",
        updateTime: 2,
      },
      createMessage(3, "recent-1"),
      createMessage(4, "recent-2", "assistant"),
    ];

    const selected = __testing__.getMessagesForCurrentContext(messages);

    expect(selected.map((message) => message.updateTime)).toEqual([2, 3, 4]);
  });

  it("keeps all history when no compaction marker exists", () => {
    const messages: ChatMessage[] = [
      createMessage(1, "old-1"),
      createMessage(2, "old-2"),
      {
        role: "assistant",
        type: "tool",
        content: JSON.stringify({
          toolName: "completeTask",
          result: "done",
          params: {
            summary: "done",
            result: "done",
          },
        }),
        updateTime: 3,
      },
      createMessage(4, "recent-1"),
      createMessage(5, "recent-2", "assistant"),
    ];

    const selected = __testing__.getMessagesForCurrentContext(messages);

    expect(selected.map((message) => message.updateTime)).toEqual([1, 2, 3, 4, 5]);
  });

  it("uses the latest compaction marker even when later tool payloads exist", () => {
    const messages: ChatMessage[] = [
      createMessage(1, "old-1"),
      {
        role: "system",
        type: "compaction",
        content: "compressed summary",
        updateTime: 2,
      },
      createMessage(3, "recent-1"),
      {
        role: "assistant",
        type: "tool",
        content: JSON.stringify({
          toolName: "completeTask",
          result: "done",
          params: {
            summary: "done",
            result: "done",
          },
        }),
        updateTime: 4,
      },
      {
        role: "system",
        type: "message",
        content: "tool result after completion",
        updateTime: 5,
      },
      createMessage(6, "recent-2"),
    ];

    const selected = __testing__.getMessagesForCurrentContext(messages);

    expect(selected.map((message) => message.updateTime)).toEqual([2, 3, 4, 5, 6]);
  });

  it("prefers the latest anchor whether it is a checkpoint or a compaction message", () => {
    const messages: ChatMessage[] = [
      createMessage(1, "old-1"),
      {
        role: "system",
        type: "checkpoint",
        content: "[Checkpoint]\n摘要：task done",
        updateTime: 2,
      },
      createMessage(3, "recent-1"),
      {
        role: "system",
        type: "compaction",
        content: "compressed summary",
        updateTime: 4,
      },
      createMessage(5, "recent-2", "assistant"),
    ];

    const selected = __testing__.getMessagesForCurrentContext(messages);

    expect(selected.map((message) => message.updateTime)).toEqual([4, 5]);
  });

  it("builds model context from completion seed history plus the active raw suffix", () => {
    const conversation = {
      workflowState: {
        currentPhase: "requirements",
        agentRole: "controller",
        visitedPhases: ["requirements"],
        skippedPhases: [],
        phaseStates: {
          requirements: { status: "in_progress" },
          design: { status: "pending" },
          execution: { status: "pending" },
          verification: { status: "pending" },
          complete: { status: "pending" },
        },
        completionSeedState: {
          sourceMessageCount: 5,
          messages: [
            {
              role: "user",
              type: "userSendMessage",
              content: "旧任务描述",
              updateTime: 1,
            },
            {
              role: "system",
              type: "checkpoint",
              content: "[Checkpoint]\n类型：task_complete\n摘要：旧任务已完成\n结果：\n交付结果",
              updateTime: 2,
            },
          ],
        },
      },
      memory: {
        messages: [
          createMessage(1, "旧任务描述"),
          createMessage(2, "旧任务中间回复", "assistant"),
          {
            role: "assistant",
            type: "tool",
            content:
              '{"kind":"assistant_tool_call","toolName":"completeTask","arguments":{"summary":"旧任务已完成","result":"交付结果"}}',
            updateTime: 3,
          },
          {
            role: "user",
            type: "tool",
            content:
              '{"kind":"tool_result","toolName":"completeTask","result":"交付结果","summary":"旧任务已完成"}',
            updateTime: 4,
          },
          {
            role: "system",
            type: "checkpoint",
            content: "[Checkpoint]\n类型：task_complete\n摘要：旧任务已完成\n结果：\n交付结果",
            updateTime: 5,
          },
          createMessage(6, "开始新任务"),
          createMessage(7, "我先看下代码", "assistant"),
        ],
      },
    } as unknown as Conversation;

    const selected = __testing__.buildMessagesForModelContext(conversation).selectedMessages;

    expect(selected.map((message) => message.content)).toEqual([
      "旧任务描述",
      "[Checkpoint]\n类型：task_complete\n摘要：旧任务已完成\n结果：\n交付结果",
      "开始新任务",
      "我先看下代码",
    ]);
  });

  it("builds a fresh context usage snapshot from current memory", () => {
    setGlobalState("modelConfigs", {
      "doubao-seed-2.0-code": {
        provider: "openai-compatible",
        apiKey: "test-key",
        models: [
          {
            name: "doubao-seed-2.0-code",
            contextWindow: 100,
          },
        ],
        compressionThreshold: 0.8,
        targetRatio: 0.5,
      },
    });

    const conversation = {
      llm: { model: "doubao-seed-2.0-code" },
      memory: {
        messages: [createMessage(1, "short user message")],
        initialSystemPrompt: "system prompt",
        contextUsage: undefined,
      },
    } as unknown as Conversation;

    const initialSnapshot = __testing__.buildContextUsageSnapshot(conversation);
    expect(initialSnapshot).not.toBeNull();

    conversation.memory.messages.push(createMessage(2, "a much longer follow-up message"));
    conversation.memory.contextUsage = initialSnapshot?.contextUsage;

    const nextSnapshot = __testing__.buildContextUsageSnapshot(conversation);
    expect(nextSnapshot).not.toBeNull();
    if (!initialSnapshot || !nextSnapshot) {
      throw new Error("expected context usage snapshots to be available");
    }
    expect(nextSnapshot.contextUsage.estimatedTokens).toBeGreaterThan(
      initialSnapshot.contextUsage.estimatedTokens,
    );
  });
});

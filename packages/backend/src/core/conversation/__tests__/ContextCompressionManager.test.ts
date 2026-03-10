import { beforeEach, describe, expect, it } from "bun:test";
import type { ChatMessage } from "@amigo-llm/types";
import { setGlobalState } from "@/globalState";
import { __testing__ } from "../ContextCompressionManager";

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
      { role: "system", type: "system", content: "system prompt", updateTime: 1 },
      createMessage(2, "old-1"),
      createMessage(3, "old-2"),
      {
        role: "system",
        type: "compaction",
        content: "compressed summary",
        updateTime: 4,
      },
      createMessage(5, "recent-1"),
      createMessage(6, "recent-2", "assistant"),
    ];

    const selected = __testing__.getMessagesForCurrentContext(messages);

    expect(selected.map((message) => message.updateTime)).toEqual([1, 4, 5, 6]);
  });

  it("chooses an older prefix to compress while preserving recent messages", () => {
    const messages: ChatMessage[] = [
      { role: "system", type: "system", content: "system prompt", updateTime: 1 },
      createMessage(2, "task start"),
      createMessage(3, "repo scan"),
      createMessage(4, "tool result", "assistant"),
      createMessage(5, "follow up"),
      createMessage(6, "final constraint"),
    ];

    const split = __testing__.decideCompressionSplit(messages, 30, 2, 2);

    expect(split).not.toBeNull();
    expect(split?.messagesToCompress.map((message) => message.updateTime)).toEqual([2, 3]);
    expect(split?.keepStartIndex).toBe(3);
  });

  it("uses the latest compaction message as the active context anchor", () => {
    const messages: ChatMessage[] = [
      { role: "system", type: "system", content: "system prompt", updateTime: 1 },
      createMessage(2, "old-1"),
      {
        role: "system",
        type: "compaction",
        content: "older summary",
        updateTime: 3,
      },
      createMessage(4, "recent-1"),
      {
        role: "system",
        type: "compaction",
        content: "newer summary",
        updateTime: 5,
      },
      createMessage(6, "recent-2", "assistant"),
    ];

    const selected = __testing__.getMessagesForCurrentContext(messages);

    expect(selected.map((message) => message.updateTime)).toEqual([1, 5, 6]);
  });

  it("builds a fresh context usage snapshot from current memory", () => {
    setGlobalState("modelConfigs", {
      "doubao-seed-2.0-code": {
        provider: "openai-compatible",
        contextWindow: 100,
        compressionThreshold: 0.8,
        targetRatio: 0.5,
      },
    });

    const conversation = {
      llm: { model: "doubao-seed-2.0-code" },
      memory: {
        messages: [
          { role: "system", type: "system", content: "system prompt", updateTime: 1 },
          createMessage(2, "short user message"),
        ],
        contextUsage: undefined,
      },
    } as any;

    const initialSnapshot = __testing__.buildContextUsageSnapshot(conversation);
    expect(initialSnapshot).not.toBeNull();

    conversation.memory.messages.push(createMessage(3, "a much longer follow-up message"));
    conversation.memory.contextUsage = initialSnapshot?.contextUsage;

    const nextSnapshot = __testing__.buildContextUsageSnapshot(conversation);
    expect(nextSnapshot).not.toBeNull();
    expect(nextSnapshot!.contextUsage.estimatedTokens).toBeGreaterThan(
      initialSnapshot!.contextUsage.estimatedTokens,
    );
  });
});

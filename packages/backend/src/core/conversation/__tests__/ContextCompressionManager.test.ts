import { describe, expect, it } from "bun:test";
import type { ChatMessage } from "@amigo-llm/types";
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
  it("keeps only the latest compression marker and later messages in active context", () => {
    const messages: ChatMessage[] = [
      { role: "system", type: "system", content: "system prompt", updateTime: 1 },
      createMessage(2, "old-1"),
      createMessage(3, "old-2"),
      {
        role: "assistant",
        type: "message",
        content: "compressed summary",
        updateTime: 4,
      },
      createMessage(5, "recent-1"),
      createMessage(6, "recent-2", "assistant"),
    ];

    const selected = __testing__.getMessagesForCurrentContext(messages, 4);

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

    const split = __testing__.decideCompressionSplit(messages, undefined, 30, 2, 2);

    expect(split).not.toBeNull();
    expect(split?.messagesToCompress.map((message) => message.updateTime)).toEqual([2, 3]);
    expect(split?.keepStartIndex).toBe(3);
  });
});

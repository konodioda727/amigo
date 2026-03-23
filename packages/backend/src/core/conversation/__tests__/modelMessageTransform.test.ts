import { describe, expect, it } from "bun:test";
import type { ChatMessage } from "@amigo-llm/types";
import { type AmigoLlm, MODEL_PROVIDERS } from "@/core/model";
import { toModelMessages } from "../modelMessageTransform";

const createStubLlm = (): AmigoLlm => ({
  model: "test-model",
  provider: MODEL_PROVIDERS.OPENAI_COMPATIBLE,
  stream: async function* () {},
});

describe("toModelMessages runtime datetime context", () => {
  it("appends current local datetime context to the latest user message", () => {
    const fixedNow = new Date("2026-03-23T10:15:30.000Z");
    const messages: ChatMessage[] = [
      {
        role: "system",
        type: "system",
        content: "BASE SYSTEM PROMPT",
      },
      {
        role: "user",
        type: "message",
        content: "6:50 提醒我",
        updateTime: fixedNow.getTime(),
      },
    ];

    const modelMessages = toModelMessages(messages, createStubLlm());
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
        role: "system",
        type: "system",
        content: "SYSTEM PROMPT",
      },
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

    const modelMessages = toModelMessages(messages, createStubLlm());

    expect(String(modelMessages[1]?.content)).toBe("昨天的消息");
    expect(String(modelMessages[3]?.content)).toContain("今天 6:50 提醒我");
    expect(String(modelMessages[3]?.content)).toContain("2026-03-23");
  });
});

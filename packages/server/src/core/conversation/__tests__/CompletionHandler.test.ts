import { describe, expect, it, mock } from "bun:test";
import { CompletionHandler } from "../CompletionHandler";

mock.module("@/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
  },
}));

mock.module("@/core/conversation/WebSocketBroadcaster", () => ({
  broadcaster: {
    broadcast: mock(),
  },
}));

describe("CompletionHandler abort guard", () => {
  it("should stop immediately when conversation is aborted", async () => {
    const handler = new CompletionHandler();
    const conversation = {
      id: "task-1",
      type: "main",
      status: "aborted",
      isAborted: true,
      userInput: "input",
      memory: {
        addMessage: mock(),
      },
    } as any;

    const shouldContinue = await handler.handleStreamCompletion(
      conversation,
      "completionResult",
      false,
      null,
    );

    expect(shouldContinue).toBe(false);
    expect(conversation.status).toBe("aborted");
  });
});

describe("CompletionHandler default tool flow", () => {
  it("should keep streaming after non-terminal tool execution", async () => {
    const handler = new CompletionHandler();
    const conversation = {
      id: "task-2",
      type: "main",
      status: "tool_executing",
      isAborted: false,
      userInput: "input",
      memory: {
        addMessage: mock(),
      },
    } as any;

    const shouldContinue = await handler.handleStreamCompletion(conversation, "bash", false, null);

    expect(shouldContinue).toBe(true);
    expect(conversation.status).toBe("streaming");
  });
});

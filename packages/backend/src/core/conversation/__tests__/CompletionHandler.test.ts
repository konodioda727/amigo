import { beforeEach, describe, expect, it, mock } from "bun:test";
import { CompletionHandler } from "../CompletionHandler";
import type { Conversation } from "../Conversation";
import { broadcaster } from "../WebSocketBroadcaster";

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
    broadcastConversation: mock(),
  },
}));

describe("CompletionHandler abort guard", () => {
  beforeEach(() => {
    (broadcaster.broadcastConversation as ReturnType<typeof mock>).mockClear();
  });

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
    } as unknown as Conversation;

    const shouldContinue = await handler.handleStreamCompletion(
      conversation,
      "message",
      false,
      null,
    );

    expect(shouldContinue).toBe(false);
    expect(conversation.status).toBe("aborted");
  });
});

describe("CompletionHandler default tool flow", () => {
  beforeEach(() => {
    (broadcaster.broadcastConversation as ReturnType<typeof mock>).mockClear();
  });

  it("should continue the loop after a tool execution error", async () => {
    const handler = new CompletionHandler();
    const addMessage = mock();
    const conversation = {
      id: "task-tool-error",
      type: "main",
      status: "tool_executing",
      isAborted: false,
      userInput: "input",
      toolService: {
        getToolFromName: mock(() => undefined),
      },
      memory: {
        addMessage,
      },
    } as unknown as Conversation;

    const shouldContinue = await handler.handleStreamCompletion(
      conversation,
      "renderLayout",
      true,
      {
        toolName: "renderLayout",
        error: "missing required field: source",
        type: "tool",
      },
    );

    expect(shouldContinue).toBe(true);
    expect(conversation.status).toBe("streaming");
    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "system",
        type: "tool",
        partial: false,
        content: expect.stringContaining("工具调用失败：renderLayout"),
      }),
    );
  });

  it("should keep streaming after non-terminal tool execution", async () => {
    const handler = new CompletionHandler();
    const conversation = {
      id: "task-2",
      type: "main",
      status: "tool_executing",
      isAborted: false,
      userInput: "input",
      toolService: {
        getToolFromName: mock(() => undefined),
      },
      memory: {
        addMessage: mock(),
      },
    } as unknown as Conversation;

    const shouldContinue = await handler.handleStreamCompletion(conversation, "bash", false, null);

    expect(shouldContinue).toBe(true);
    expect(conversation.status).toBe("streaming");
  });

  it("should stop after idle custom tool execution", async () => {
    const handler = new CompletionHandler();
    const conversation = {
      id: "task-3",
      type: "main",
      status: "tool_executing",
      isAborted: false,
      userInput: "input",
      toolService: {
        getToolFromName: mock(() => ({
          name: "customAsk",
          completionBehavior: "idle",
        })),
      },
      memory: {
        addMessage: mock(),
      },
    } as unknown as Conversation;

    const shouldContinue = await handler.handleStreamCompletion(
      conversation,
      "customAsk",
      false,
      null,
    );

    expect(shouldContinue).toBe(false);
    expect(conversation.status).toBe("idle");
    expect(conversation.userInput).toBe("");
    expect(broadcaster.broadcastConversation).toHaveBeenCalledWith(conversation, {
      type: "conversationOver",
      data: {
        reason: "tool",
      },
    });
  });

  it("should preserve askFollowupQuestion conversationOver reason", async () => {
    const handler = new CompletionHandler();
    const conversation = {
      id: "task-4",
      type: "main",
      status: "tool_executing",
      isAborted: false,
      userInput: "input",
      toolService: {
        getToolFromName: mock(() => ({
          name: "askFollowupQuestion",
          completionBehavior: "idle",
        })),
      },
      memory: {
        addMessage: mock(),
      },
    } as unknown as Conversation;

    const shouldContinue = await handler.handleStreamCompletion(
      conversation,
      "askFollowupQuestion",
      false,
      null,
    );

    expect(shouldContinue).toBe(false);
    expect(conversation.status).toBe("idle");
    expect(broadcaster.broadcastConversation).toHaveBeenCalledWith(conversation, {
      type: "conversationOver",
      data: {
        reason: "askFollowupQuestion",
      },
    });
  });
});

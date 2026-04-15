import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  clearConversationContinuations,
  enqueueConversationContinuation,
  flushConversationContinuationsIfIdle,
} from "../context/asyncContinuations";
import { broadcaster } from "../lifecycle/WebSocketBroadcaster";

mock.module("@/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

mock.module("@/core/conversation/lifecycle/WebSocketBroadcaster", () => ({
  broadcaster: {
    broadcast: mock(),
    broadcastConversation: mock(),
  },
}));

describe("asyncContinuations", () => {
  beforeEach(() => {
    clearConversationContinuations("idle-continuation");
    (broadcaster.broadcast as ReturnType<typeof mock>).mockClear();
  });

  it("applies injection before running idle continuations", async () => {
    const addMessage = mock();
    const run = mock(async (conversation: any) => {
      expect(conversation.userInput).toBe("__amigo_internal_dependency_continuation__");
      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "user",
          content: "依赖安装已完成。",
        }),
      );
    });

    const conversation = {
      id: "idle-continuation",
      status: "idle",
      isAborted: false,
      userInput: "",
      memory: {
        addMessage,
      },
    } as any;

    enqueueConversationContinuation({
      conversation,
      reason: "dependency ready",
      injectBeforeNextTurn: (currentConversation) => {
        currentConversation.memory.addMessage({
          role: "user",
          content: "依赖安装已完成。",
          type: "system",
          partial: false,
        });
        currentConversation.userInput = "__amigo_internal_dependency_continuation__";
      },
      run,
    });

    await flushConversationContinuationsIfIdle(conversation);

    expect(run).toHaveBeenCalledTimes(1);
    expect(broadcaster.broadcast).toHaveBeenCalledWith(
      "idle-continuation",
      expect.objectContaining({
        type: "ack",
        data: expect.objectContaining({
          status: "acked",
          targetMessage: expect.objectContaining({
            type: "resume",
          }),
        }),
      }),
    );
  });
});

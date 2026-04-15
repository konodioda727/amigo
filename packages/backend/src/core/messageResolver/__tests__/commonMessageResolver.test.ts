import { describe, expect, it, mock } from "bun:test";

const execute = mock();
const getCurrentAbortController = mock();
const setUserInput = mock(async () => {});
const getExecutor = mock(() => ({
  execute,
  getCurrentAbortController,
}));

mock.module("@/core/conversation", () => ({
  conversationOrchestrator: {
    setUserInput,
    getExecutor,
  },
}));

import { CommonMessageResolver } from "../commonMessageResolver/index";

describe("CommonMessageResolver", () => {
  it("restarts execution when a conversation is stuck in streaming without an active executor", async () => {
    execute.mockClear();
    getExecutor.mockClear();
    getCurrentAbortController.mockReset();
    getCurrentAbortController.mockReturnValue(null);
    setUserInput.mockClear();

    const conversation = {
      id: "task-stale-streaming",
      status: "streaming",
    } as any;

    const resolver = new CommonMessageResolver(conversation);
    await resolver.process({
      message: "继续",
      taskId: "task-stale-streaming",
    } as any);

    expect(setUserInput).toHaveBeenCalledWith(conversation, "继续", undefined, undefined);
    expect(getExecutor).toHaveBeenCalledWith("task-stale-streaming");
    expect(execute).toHaveBeenCalledWith(conversation);
  });

  it("does not restart execution when streaming already has an active executor", async () => {
    execute.mockClear();
    getExecutor.mockClear();
    getCurrentAbortController.mockReset();
    getCurrentAbortController.mockReturnValue(new AbortController());
    setUserInput.mockClear();

    const conversation = {
      id: "task-active-streaming",
      status: "streaming",
    } as any;

    const resolver = new CommonMessageResolver(conversation);
    await resolver.process({
      message: "继续",
      taskId: "task-active-streaming",
    } as any);

    expect(setUserInput).toHaveBeenCalledWith(conversation, "继续", undefined, undefined);
    expect(getExecutor).toHaveBeenCalledWith("task-active-streaming");
    expect(execute).not.toHaveBeenCalled();
  });
});

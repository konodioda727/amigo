import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { conversationOrchestrator } from "@/core/conversation";

const execute = mock();
const getCurrentAbortController = mock();
const setUserInput = mock(async () => {});
const getExecutor = mock(() => ({
  execute,
  getCurrentAbortController,
}));

import { CommonMessageResolver } from "../commonMessageResolver/index";

const originalSetUserInput = conversationOrchestrator.setUserInput.bind(conversationOrchestrator);
const originalGetExecutor = conversationOrchestrator.getExecutor.bind(conversationOrchestrator);

describe("CommonMessageResolver", () => {
  beforeEach(() => {
    execute.mockClear();
    getExecutor.mockClear();
    getCurrentAbortController.mockReset();
    setUserInput.mockClear();
    conversationOrchestrator.setUserInput =
      setUserInput as typeof conversationOrchestrator.setUserInput;
    conversationOrchestrator.getExecutor =
      getExecutor as typeof conversationOrchestrator.getExecutor;
  });

  afterEach(() => {
    conversationOrchestrator.setUserInput = originalSetUserInput;
    conversationOrchestrator.getExecutor = originalGetExecutor;
  });

  it("restarts execution when a conversation is stuck in streaming without an active executor", async () => {
    getCurrentAbortController.mockReset();
    getCurrentAbortController.mockReturnValue(null);

    const conversation = {
      id: "task-stale-streaming",
      status: "streaming",
    } as any;

    const resolver = new CommonMessageResolver(conversation);
    await resolver.process({
      message: "继续",
      taskId: "task-stale-streaming",
    } as any);

    expect(setUserInput).toHaveBeenCalledWith(conversation, "继续", undefined);
    expect(getExecutor).toHaveBeenCalledWith("task-stale-streaming");
    expect(execute).toHaveBeenCalledWith(conversation);
  });

  it("does not restart execution when streaming already has an active executor", async () => {
    getCurrentAbortController.mockReset();
    getCurrentAbortController.mockReturnValue(new AbortController());

    const conversation = {
      id: "task-active-streaming",
      status: "streaming",
    } as any;

    const resolver = new CommonMessageResolver(conversation);
    await resolver.process({
      message: "继续",
      taskId: "task-active-streaming",
    } as any);

    expect(setUserInput).toHaveBeenCalledWith(conversation, "继续", undefined);
    expect(getExecutor).toHaveBeenCalledWith("task-active-streaming");
    expect(execute).not.toHaveBeenCalled();
  });
});

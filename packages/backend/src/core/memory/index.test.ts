import { describe, expect, it } from "bun:test";
import { shouldOverwritePrevWebsocketMessage } from "./index";

describe("shouldOverwritePrevWebsocketMessage", () => {
  it("overwrites streamed updates from the same tool call when updateTime matches", () => {
    const previous = {
      type: "tool",
      data: {
        message: JSON.stringify({
          toolName: "readFile",
          toolCallId: "call-1",
          params: { filePaths: ["a.ts"] },
        }),
        partial: true,
        updateTime: 1000,
        taskId: "task-1",
      },
    } as const;

    const next = {
      type: "tool",
      data: {
        message: JSON.stringify({
          toolName: "readFile",
          toolCallId: "call-1",
          params: { filePaths: ["a.ts"] },
          result: { success: true },
        }),
        partial: false,
        updateTime: 1000,
        taskId: "task-1",
      },
    } as const;

    expect(shouldOverwritePrevWebsocketMessage(previous, next)).toBe(true);
  });

  it("does not overwrite a different parallel tool call just because the message type matches", () => {
    const previous = {
      type: "tool",
      data: {
        message: JSON.stringify({
          toolName: "readFile",
          toolCallId: "call-1",
          params: { filePaths: ["a.ts"] },
        }),
        partial: true,
        updateTime: 1000,
        taskId: "task-1",
      },
    } as const;

    const next = {
      type: "tool",
      data: {
        message: JSON.stringify({
          toolName: "listFiles",
          toolCallId: "call-2",
          params: { directoryPath: "src" },
        }),
        partial: true,
        updateTime: 1001,
        taskId: "task-1",
      },
    } as const;

    expect(shouldOverwritePrevWebsocketMessage(previous, next)).toBe(false);
  });
});

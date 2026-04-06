import { describe, expect, test } from "bun:test";
import { canSwitchTaskModel, getTaskModelKey } from "../AppMessageComposer";

describe("canSwitchTaskModel", () => {
  test("allows switching before a task exists", () => {
    expect(canSwitchTaskModel(undefined, "idle")).toBe(true);
  });

  test("blocks switching only while streaming", () => {
    expect(canSwitchTaskModel("task-1", "streaming")).toBe(false);
  });

  test("allows switching for non-streaming task states", () => {
    expect(canSwitchTaskModel("task-1", "idle")).toBe(true);
    expect(canSwitchTaskModel("task-1", "interrupted")).toBe(true);
    expect(canSwitchTaskModel("task-1", "waiting_tool_call")).toBe(true);
    expect(canSwitchTaskModel("task-1", "completed")).toBe(true);
    expect(canSwitchTaskModel("task-1", "error")).toBe(true);
  });
});

describe("getTaskModelKey", () => {
  test("returns a stable key for equivalent task contexts", () => {
    expect(getTaskModelKey({ model: "gpt-5", modelConfigId: "openai-main" })).toBe(
      "openai-main::gpt-5",
    );
    expect(getTaskModelKey({ model: "gpt-5", modelConfigId: "openai-main" })).toBe(
      "openai-main::gpt-5",
    );
  });

  test("returns empty when task model context is incomplete", () => {
    expect(getTaskModelKey({ model: "gpt-5" })).toBe("");
    expect(getTaskModelKey(null)).toBe("");
  });
});

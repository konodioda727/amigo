import { describe, expect, test } from "bun:test";
import {
  canSwitchTaskModel,
  getTaskModelKey,
  resolveComposerModelKey,
} from "../AppMessageComposer";

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

describe("model key stability", () => {
  test("task model keys remain equal across repeated object recreation", () => {
    const first = getTaskModelKey({ model: "gpt-5", modelConfigId: "openai-main" });
    const second = getTaskModelKey({ model: "gpt-5", modelConfigId: "openai-main" });

    expect(first).toBe("openai-main::gpt-5");
    expect(second).toBe(first);
  });
});

describe("resolveComposerModelKey", () => {
  const availableModels = [
    { configId: "openai", model: "gpt-5", provider: "openai-compatible" },
    { configId: "anthropic", model: "claude-sonnet-4", provider: "openai-compatible" },
  ];

  test("keeps the user's new-conversation selection when it is still valid", () => {
    expect(
      resolveComposerModelKey({
        effectiveTaskId: undefined,
        availableModels,
        defaultModelKey: "openai::gpt-5",
        activeTaskModelKey: "",
        currentSelectedModelKey: "anthropic::claude-sonnet-4",
      }),
    ).toBe("anthropic::claude-sonnet-4");
  });

  test("keeps the saved selection while model options are still loading", () => {
    expect(
      resolveComposerModelKey({
        effectiveTaskId: undefined,
        availableModels: [],
        defaultModelKey: "openai::gpt-5",
        activeTaskModelKey: "",
        currentSelectedModelKey: "anthropic::claude-sonnet-4",
      }),
    ).toBe("anthropic::claude-sonnet-4");
  });

  test("prefers the active task model for existing conversations", () => {
    expect(
      resolveComposerModelKey({
        effectiveTaskId: "task-1",
        availableModels,
        defaultModelKey: "openai::gpt-5",
        activeTaskModelKey: "anthropic::claude-sonnet-4",
        currentSelectedModelKey: "openai::gpt-5",
      }),
    ).toBe("anthropic::claude-sonnet-4");
  });
});

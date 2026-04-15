import { describe, expect, test } from "bun:test";
import { canSwitchTaskModel, getTaskModelKey, getTaskWorkflowMode } from "../AppMessageComposer";

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

describe("getTaskWorkflowMode", () => {
  test("defaults to phased when workflow state is missing", () => {
    expect(getTaskWorkflowMode(undefined)).toBe("phased");
    expect(getTaskWorkflowMode(null)).toBe("phased");
  });

  test("reads fast mode from workflow state", () => {
    expect(
      getTaskWorkflowMode({
        currentPhase: "complete",
        agentRole: "controller",
        mode: "fast",
        visitedPhases: ["complete"],
        skippedPhases: [],
        phaseStates: {
          requirements: { status: "skipped" },
          design: { status: "skipped" },
          execution: { status: "skipped" },
          verification: { status: "skipped" },
          complete: { status: "completed" },
        },
      }),
    ).toBe("fast");
  });
});

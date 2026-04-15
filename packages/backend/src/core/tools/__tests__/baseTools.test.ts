import { afterEach, describe, expect, it } from "bun:test";
import type { ToolInterface } from "@amigo-llm/types";
import { setGlobalState } from "@/globalState";
import {
  AskFollowupQuestions,
  Bash,
  DEFAULT_CONTROLLER_BASIC_TOOLS,
  DEFAULT_WORKER_BASIC_TOOLS,
  getBaseTools,
  ListFiles,
  OverridePhase,
} from "../index";

describe("getBaseTools", () => {
  afterEach(() => {
    setGlobalState("baseTools", {});
  });

  it("returns default base tools when no override is configured", () => {
    expect(getBaseTools("controller")).toEqual(DEFAULT_CONTROLLER_BASIC_TOOLS);
    expect(getBaseTools("worker")).toEqual(DEFAULT_WORKER_BASIC_TOOLS);
  });

  it("returns configured base tools when override exists", () => {
    const customControllerTools = [Bash] as ToolInterface<any>[];
    const customWorkerTools = [AskFollowupQuestions] as ToolInterface<any>[];

    setGlobalState("baseTools", {
      controller: customControllerTools,
      worker: customWorkerTools,
    });

    expect(getBaseTools("controller")).toEqual(customControllerTools);
    expect(getBaseTools("worker")).toEqual(customWorkerTools);
  });

  it("does not include installDependencies in default tool sets", () => {
    expect(DEFAULT_CONTROLLER_BASIC_TOOLS.map((tool) => tool.name)).not.toContain(
      "installDependencies",
    );
    expect(DEFAULT_WORKER_BASIC_TOOLS.map((tool) => tool.name)).not.toContain(
      "installDependencies",
    );
  });

  it("includes listFiles in default tool sets", () => {
    expect(DEFAULT_CONTROLLER_BASIC_TOOLS).toContain(ListFiles);
    expect(DEFAULT_WORKER_BASIC_TOOLS).toContain(ListFiles);
  });

  it("exposes overridePhase in controller defaults", () => {
    expect(DEFAULT_CONTROLLER_BASIC_TOOLS).toContain(OverridePhase);
    expect(DEFAULT_CONTROLLER_BASIC_TOOLS.map((tool) => tool.name)).toContain("overridePhase");
  });
});

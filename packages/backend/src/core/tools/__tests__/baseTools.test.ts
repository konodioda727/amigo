import { afterEach, describe, expect, it } from "bun:test";
import type { ToolInterface } from "@amigo-llm/types";
import { setGlobalState } from "@/globalState";
import {
  AskFollowupQuestions,
  Bash,
  DEFAULT_CONTROLLER_BASIC_TOOLS,
  DEFAULT_WORKER_BASIC_TOOLS,
  FinishPhase,
  getBaseTools,
  ListFiles,
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

  it("keeps removed dependency-install helpers out of default tool sets", () => {
    const controllerNames = DEFAULT_CONTROLLER_BASIC_TOOLS.map((tool) => tool.name);
    const workerNames = DEFAULT_WORKER_BASIC_TOOLS.map((tool) => tool.name);

    expect(controllerNames.some((name) => name.toLowerCase().includes("install"))).toBe(false);
    expect(workerNames.some((name) => name.toLowerCase().includes("install"))).toBe(false);
  });

  it("includes listFiles in default tool sets", () => {
    expect(DEFAULT_CONTROLLER_BASIC_TOOLS).toContain(ListFiles);
    expect(DEFAULT_WORKER_BASIC_TOOLS).toContain(ListFiles);
  });

  it("exposes finishPhase in controller defaults", () => {
    expect(DEFAULT_CONTROLLER_BASIC_TOOLS).toContain(FinishPhase);
    expect(DEFAULT_CONTROLLER_BASIC_TOOLS.map((tool) => tool.name)).toContain("finishPhase");
  });
});

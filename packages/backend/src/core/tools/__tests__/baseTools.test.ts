import { afterEach, describe, expect, it } from "bun:test";
import type { ToolInterface } from "@amigo-llm/types";
import { setGlobalState } from "@/globalState";
import {
  AskFollowupQuestions,
  Bash,
  DEFAULT_MAIN_BASIC_TOOLS,
  DEFAULT_SUB_BASIC_TOOLS,
  getBaseTools,
  InstallDependencies,
  ListFiles,
} from "../index";

describe("getBaseTools", () => {
  afterEach(() => {
    setGlobalState("baseTools", {});
  });

  it("returns default base tools when no override is configured", () => {
    expect(getBaseTools("main")).toEqual(DEFAULT_MAIN_BASIC_TOOLS);
    expect(getBaseTools("sub")).toEqual(DEFAULT_SUB_BASIC_TOOLS);
  });

  it("returns configured base tools when override exists", () => {
    const customMainTools = [Bash] as ToolInterface<any>[];
    const customSubTools = [AskFollowupQuestions] as ToolInterface<any>[];

    setGlobalState("baseTools", {
      main: customMainTools,
      sub: customSubTools,
    });

    expect(getBaseTools("main")).toEqual(customMainTools);
    expect(getBaseTools("sub")).toEqual(customSubTools);
  });

  it("includes installDependencies in default tool sets", () => {
    expect(DEFAULT_MAIN_BASIC_TOOLS).toContain(InstallDependencies);
    expect(DEFAULT_SUB_BASIC_TOOLS).toContain(InstallDependencies);
  });

  it("includes listFiles in default tool sets", () => {
    expect(DEFAULT_MAIN_BASIC_TOOLS).toContain(ListFiles);
    expect(DEFAULT_SUB_BASIC_TOOLS).toContain(ListFiles);
  });
});

import { describe, expect, it } from "bun:test";
import type { ToolExecutionContext } from "@amigo-llm/types";
import { runChecksTool } from "./index";

const createContext = (dependencyStatus: "idle" | "running" | "failed" | "success" = "idle") =>
  ({
    taskId: "task-run-checks",
    parentId: undefined,
    signal: undefined,
    postToolUpdate: undefined,
    getSandbox: async () => ({
      isRunning: () => true,
      getDependencyInstallStatus: () => ({
        status: dependencyStatus,
        logPath: "/tmp/deps.log",
        error: dependencyStatus === "failed" ? "install failed" : undefined,
      }),
      runCommand: async () => "",
    }),
    getToolByName: () => undefined,
  }) satisfies ToolExecutionContext;

describe("runChecksTool", () => {
  it("returns a valid invoke result structure when dependencies are not installed", async () => {
    const result = await runChecksTool.invoke({
      params: {
        commands: ["npm run build"],
        workingDir: "/sandbox",
      },
      context: createContext("idle"),
    });

    expect(result.transport.result).toEqual({
      success: false,
      overallStatus: "failed",
      preset: "custom",
      workingDir: ".",
      failedSteps: [],
      steps: [],
      message:
        "依赖尚未安装。请先读取目标目录的 package.json/README/锁文件，确认真实安装方式后调用 installDependencies，并传入明确的 installCommand。",
    });
    expect(result.continuation.result).toEqual(result.transport.result);
  });
});

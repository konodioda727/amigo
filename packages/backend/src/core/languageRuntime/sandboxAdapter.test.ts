import { describe, expect, it, mock } from "bun:test";
import { createLanguageRuntimeHostManagerFromSandboxManager } from "./sandboxAdapter";

describe("createLanguageRuntimeHostManagerFromSandboxManager", () => {
  it("adapts sandbox command and stdio capabilities into a runtime host", async () => {
    const stdioProcess = {
      write: mock(async () => {}),
      closeInput: mock(async () => {}),
      kill: mock(async () => {}),
      onStdout: mock(() => () => {}),
      onStderr: mock(() => () => {}),
      onExit: mock(() => () => {}),
    };
    const sandbox = {
      runCommand: mock(async (cmd: string) => `ran:${cmd}`),
      spawnStdioProcess: mock(async () => stdioProcess),
    };
    const manager = createLanguageRuntimeHostManagerFromSandboxManager(
      {
        get: mock(() => sandbox),
        getOrCreate: mock(async () => sandbox),
        has: mock(() => true),
        destroy: mock(async () => {}),
      },
      { cwd: "/workspace" },
    );

    const host = await manager.getOrCreate("task-1");
    const output = await host.runCommand("pwd");
    const processHandle = await host.spawnStdioProcess({
      command: "typescript-language-server",
      args: ["--stdio"],
    });

    expect(host.id).toBe("task-1");
    expect(host.cwd).toBe("/workspace");
    expect(output).toBe("ran:pwd");
    expect(processHandle).toBe(stdioProcess);
    expect(sandbox.spawnStdioProcess).toHaveBeenCalledWith({
      command: "typescript-language-server",
      args: ["--stdio"],
      cwd: "/workspace",
    });
  });
});

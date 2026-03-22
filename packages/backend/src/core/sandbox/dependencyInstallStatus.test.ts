import { describe, expect, it } from "bun:test";
import { Sandbox } from "./index";

describe("Sandbox dependency install status", () => {
  it("invalidates a cached success state when installCommand changes", async () => {
    const sandbox = new Sandbox();
    const sandboxInternal = sandbox as any;
    let inspected = false;

    sandboxInternal.dependencyInstallStates.set(".", {
      status: "success",
      packageManager: "custom",
      installCommand: "npm install",
      logPath: "/tmp/amigo/dependency-install-root.log",
    });
    sandbox.runCommand = async () => {
      inspected = true;
      return "__AMIGO_DEP_STATE__:installed\n";
    };

    const status = await sandbox.resolveDependencyInstallStatus({
      workingDir: ".",
      expectedInstallCommand: "pnpm install",
    });

    expect(status.status).toBe("idle");
    expect(inspected).toBe(false);
  });

  it("invalidates a cached success state when node_modules is missing", async () => {
    const sandbox = new Sandbox();
    const sandboxInternal = sandbox as any;

    sandboxInternal.dependencyInstallStates.set(".", {
      status: "success",
      packageManager: "custom",
      installCommand: "pnpm install",
      logPath: "/tmp/amigo/dependency-install-root.log",
    });
    sandbox.runCommand = async () => "__AMIGO_DEP_STATE__:missing\n";

    const status = await sandbox.resolveDependencyInstallStatus({
      workingDir: ".",
      expectedInstallCommand: "pnpm install",
    });

    expect(status.status).toBe("idle");
  });

  it("keeps a cached success state when dependency artifacts are present", async () => {
    const sandbox = new Sandbox();
    const sandboxInternal = sandbox as any;

    sandboxInternal.dependencyInstallStates.set(".", {
      status: "success",
      packageManager: "custom",
      installCommand: "pnpm install",
      logPath: "/tmp/amigo/dependency-install-root.log",
    });
    sandbox.runCommand = async () => "__AMIGO_DEP_STATE__:installed\n";

    const status = await sandbox.resolveDependencyInstallStatus({
      workingDir: ".",
      expectedInstallCommand: "pnpm install",
    });

    expect(status.status).toBe("success");
    expect(status.installCommand).toBe("pnpm install");
  });
});

import { describe, expect, it, mock } from "bun:test";
import { buildDockerExecArgs, Sandbox } from "./index";

describe("Sandbox hydrateBootstrapRepository", () => {
  it("resets origin to the real repository after cloning from the bootstrap mirror", async () => {
    const sandbox = new Sandbox() as unknown as {
      hydrateBootstrapRepository: (
        branch: string,
        commitSha: string,
        repoUrl: string,
      ) => Promise<void>;
      runCommand: (cmd: string) => Promise<string>;
    };
    let command = "";
    const runCommand = mock(async (cmd: string) => {
      command = cmd;
      return "";
    });
    sandbox.runCommand = runCommand;

    await sandbox.hydrateBootstrapRepository(
      "main",
      "0123456789abcdef0123456789abcdef01234567",
      "https://github.com/example/amigo.git",
    );

    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(command).toContain("git remote set-url origin 'https://github.com/example/amigo.git'");
  });

  it("configures a GitHub credential helper when a token env is available", async () => {
    const previousGithubToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "test-token";

    try {
      const sandbox = new Sandbox() as unknown as {
        hydrateBootstrapRepository: (
          branch: string,
          commitSha: string,
          repoUrl: string,
        ) => Promise<void>;
        runCommand: (cmd: string) => Promise<string>;
      };
      let command = "";
      const runCommand = mock(async (cmd: string) => {
        command = cmd;
        return "";
      });
      sandbox.runCommand = runCommand;

      await sandbox.hydrateBootstrapRepository(
        "main",
        "0123456789abcdef0123456789abcdef01234567",
        "https://github.com/example/amigo.git",
      );

      expect(runCommand).toHaveBeenCalledTimes(1);
      expect(command).toContain("git config credential.helper");
      expect(command).toContain("password=${GITHUB_TOKEN:-${GH_TOKEN:-}}");
    } finally {
      if (previousGithubToken === undefined) {
        delete process.env.GITHUB_TOKEN;
      } else {
        process.env.GITHUB_TOKEN = previousGithubToken;
      }
    }
  });
});

describe("Sandbox queueEditorOpenFile", () => {
  it("does not duplicate the sandbox prefix for sandbox-absolute paths", async () => {
    const sandbox = new Sandbox() as unknown as {
      container: object | null;
      queueEditorOpenFile: (filePath: string, line?: number, column?: number) => Promise<void>;
      runCommand: (cmd: string) => Promise<string>;
    };
    let command = "";
    const runCommand = mock(async (cmd: string) => {
      command = cmd;
      return "";
    });
    sandbox.container = {};
    sandbox.runCommand = runCommand;

    await sandbox.queueEditorOpenFile("/sandbox/packages/app/src/index.ts", 12, 3);

    expect(runCommand).toHaveBeenCalledTimes(1);
    const encodedPayload = command.match(/printf '%s' '([^']+)' \| base64 -d >/)?.[1];
    expect(encodedPayload).toBeTruthy();

    const payload = JSON.parse(Buffer.from(encodedPayload!, "base64").toString("utf8")) as {
      path: string;
      line?: number;
      column?: number;
    };

    expect(payload.path).toBe("/sandbox/packages/app/src/index.ts");
    expect(payload.line).toBe(12);
    expect(payload.column).toBe(3);
  });
});

describe("Sandbox dependency install commands", () => {
  it("creates the log directory before running a detected install plan", async () => {
    const sandbox = new Sandbox() as unknown as {
      container: object | null;
      installDependencies: (params: { workingDir: string }) => Promise<void>;
      detectDependencyInstallPlan: (workingDir: string) => Promise<{
        packageManager: string;
        installCommand?: string;
      }>;
      runCommand: (cmd: string) => Promise<string>;
      dependencyInstallStates: Map<string, unknown>;
    };
    let command = "";
    sandbox.container = {};
    sandbox.detectDependencyInstallPlan = async () => ({
      packageManager: "pnpm",
      installCommand: "pnpm install",
    });
    sandbox.runCommand = mock(async (cmd: string) => {
      command = cmd;
      return "";
    });

    await sandbox.installDependencies({ workingDir: "." });

    expect(command).toContain("mkdir -p /tmp/amigo");
    expect(command).toContain("(pnpm install) >'/tmp/amigo/dependency-install-root.log' 2>&1");
  });

  it("creates the log directory before running a custom install command", async () => {
    const sandbox = new Sandbox() as unknown as {
      container: object | null;
      runDependencyInstallCommand: (params: {
        workingDir: string;
        installCommand: string;
      }) => Promise<void>;
      runCommand: (cmd: string) => Promise<string>;
    };
    let command = "";
    sandbox.container = {};
    sandbox.runCommand = mock(async (cmd: string) => {
      command = cmd;
      return "";
    });

    await sandbox.runDependencyInstallCommand({
      workingDir: "packages/backend",
      installCommand: "bun install",
    });

    expect(command).toContain("mkdir -p /tmp/amigo");
    expect(command).toContain(
      "(bun install) >'/tmp/amigo/dependency-install-packages_backend.log' 2>&1",
    );
  });
});

describe("buildDockerExecArgs", () => {
  it("builds docker exec args with cwd, env, command, and args", () => {
    const args = buildDockerExecArgs("container-123", {
      command: "typescript-language-server",
      args: ["--stdio"],
      cwd: "/sandbox/packages/plugin",
      env: {
        NODE_ENV: "development",
        EMPTY: "",
      },
    });

    expect(args).toEqual([
      "exec",
      "-i",
      "-w",
      "/sandbox/packages/plugin",
      "-e",
      "NODE_ENV=development",
      "container-123",
      "typescript-language-server",
      "--stdio",
    ]);
  });
});

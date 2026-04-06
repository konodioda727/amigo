import type { Sandbox, SandboxManager } from "../sandbox";
import type {
  LanguageRuntimeHost,
  LanguageRuntimeHostManager,
  SpawnStdioProcessParams,
} from "./types";

export interface SandboxLanguageRuntimeAdapterOptions {
  cwd?: string;
}

const DEFAULT_SANDBOX_RUNTIME_CWD = "/sandbox";

const createSandboxLanguageRuntimeHost = (
  taskId: string,
  sandbox: Sandbox,
  options?: SandboxLanguageRuntimeAdapterOptions,
): LanguageRuntimeHost => {
  const cwd = options?.cwd?.trim() || DEFAULT_SANDBOX_RUNTIME_CWD;

  return {
    id: taskId,
    cwd,
    runCommand: (cmd, signal) => sandbox.runCommand(cmd, signal),
    spawnStdioProcess: (params: SpawnStdioProcessParams) =>
      sandbox.spawnStdioProcess({
        ...params,
        cwd: params.cwd?.trim() || cwd,
      }),
  };
};

export const createLanguageRuntimeHostManagerFromSandboxManager = (
  sandboxManager: SandboxManager<Sandbox>,
  options?: SandboxLanguageRuntimeAdapterOptions,
): LanguageRuntimeHostManager => ({
  get(taskId) {
    const sandbox = sandboxManager.get(taskId);
    return sandbox ? createSandboxLanguageRuntimeHost(taskId, sandbox, options) : undefined;
  },
  async getOrCreate(taskId) {
    const sandbox = await sandboxManager.getOrCreate(taskId);
    return createSandboxLanguageRuntimeHost(taskId, sandbox, options);
  },
  async destroy(taskId) {
    await sandboxManager.destroy(taskId);
  },
});

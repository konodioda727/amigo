import type { SandboxOptions } from "./types";

const DEFAULT_SANDBOX_MEMORY_LIMIT_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
const DEFAULT_SANDBOX_IMAGE = "ai_sandbox";
const DEFAULT_SANDBOX_RUNTIME = process.platform === "darwin" ? "runc" : "runsc";

export interface ResolvedSandboxOptions {
  imageName: string;
  runtime: string;
  memoryLimitBytes: number;
}

export const resolveSandboxOptions = (options: SandboxOptions = {}): ResolvedSandboxOptions => ({
  imageName: options.imageName?.trim() || DEFAULT_SANDBOX_IMAGE,
  runtime: options.runtime?.trim() || DEFAULT_SANDBOX_RUNTIME,
  memoryLimitBytes:
    typeof options.memoryLimitBytes === "number" && options.memoryLimitBytes > 0
      ? options.memoryLimitBytes
      : DEFAULT_SANDBOX_MEMORY_LIMIT_BYTES,
});

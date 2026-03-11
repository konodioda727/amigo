import type { Sandbox } from "@/core/sandbox";

const DEFAULT_WORKING_DIR = ".";

export function normalizeSandboxToolWorkingDir(input: string | undefined): string {
  const trimmed = (input || DEFAULT_WORKING_DIR).trim();
  if (!trimmed || trimmed === "/sandbox") {
    return DEFAULT_WORKING_DIR;
  }

  return trimmed.replace(/^\/sandbox\/?/, "").replace(/^\/+/, "") || DEFAULT_WORKING_DIR;
}

export function getDependencyStatusForToolResult(
  status: ReturnType<Sandbox["getDependencyInstallStatus"]>["status"],
): "pending" | "running" | "success" | "failed" | "not_required" {
  return status === "idle" ? "pending" : status;
}

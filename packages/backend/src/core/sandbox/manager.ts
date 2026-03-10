import { getGlobalState } from "@/globalState";
import { sandboxRegistry } from "./SandboxRegistry";
import type { SandboxManager } from "./types";

export function getSandboxManager(): SandboxManager {
  return getGlobalState("sandboxManager") || sandboxRegistry;
}

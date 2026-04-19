import type { GithubBootstrapSummary } from "./githubBootstrap";

const STORAGE_KEY = "amigo.pendingConversationLaunch";

export interface PendingConversationLaunch {
  taskId?: string;
  selectedModelKey: string;
  selectedSkillIds: string[];
  pendingBootstrap: GithubBootstrapSummary | null;
}

const normalizeSkillIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
};

export function getPendingConversationLaunch(): PendingConversationLaunch | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PendingConversationLaunch>;
    return {
      ...(typeof parsed.taskId === "string" && parsed.taskId.trim()
        ? { taskId: parsed.taskId.trim() }
        : {}),
      selectedModelKey:
        typeof parsed.selectedModelKey === "string" ? parsed.selectedModelKey.trim() : "",
      selectedSkillIds: normalizeSkillIds(parsed.selectedSkillIds),
      pendingBootstrap:
        parsed.pendingBootstrap &&
        typeof parsed.pendingBootstrap === "object" &&
        !Array.isArray(parsed.pendingBootstrap)
          ? (parsed.pendingBootstrap as GithubBootstrapSummary)
          : null,
    };
  } catch {
    return null;
  }
}

export function setPendingConversationLaunch(launch: PendingConversationLaunch): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...(launch.taskId ? { taskId: launch.taskId } : {}),
      selectedModelKey: launch.selectedModelKey,
      selectedSkillIds: normalizeSkillIds(launch.selectedSkillIds),
      pendingBootstrap: launch.pendingBootstrap,
    }),
  );
}

export function clearPendingConversationLaunch(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(STORAGE_KEY);
}

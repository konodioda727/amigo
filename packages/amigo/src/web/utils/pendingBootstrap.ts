import type { GithubBootstrapSummary } from "./githubBootstrap";

const STORAGE_KEY = "amigo.pendingBootstrap";
const EVENT_NAME = "amigo:pending-bootstrap-updated";

function emitUpdate(): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function getPendingBootstrap(): GithubBootstrapSummary | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as GithubBootstrapSummary;
  } catch {
    return null;
  }
}

export function setPendingBootstrap(summary: GithubBootstrapSummary): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(summary));
  emitUpdate();
}

export function clearPendingBootstrap(): void {
  window.localStorage.removeItem(STORAGE_KEY);
  emitUpdate();
}

export function subscribePendingBootstrap(listener: () => void): () => void {
  const handler = () => listener();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}

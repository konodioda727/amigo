export const getHttpBaseUrlFromWebSocketUrl = (wsUrl: string): string => {
  const parsed = new URL(wsUrl);
  parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
};

export const getSandboxEditorUrl = (wsUrl: string, sandboxId?: string | null): string => {
  if (!sandboxId) {
    return "";
  }

  return `${getHttpBaseUrlFromWebSocketUrl(wsUrl)}/api/tasks/${encodeURIComponent(sandboxId)}/editor`;
};

export const getSandboxOpenFileUrl = (wsUrl: string, sandboxId?: string | null): string => {
  if (!sandboxId) {
    return "";
  }

  return `${getHttpBaseUrlFromWebSocketUrl(wsUrl)}/api/tasks/${encodeURIComponent(sandboxId)}/editor/open-file`;
};

export const getSandboxPreviewUrl = (wsUrl: string, sandboxId?: string | null): string => {
  if (!sandboxId) {
    return "";
  }

  return `${getHttpBaseUrlFromWebSocketUrl(wsUrl)}/api/tasks/${encodeURIComponent(sandboxId)}/preview`;
};

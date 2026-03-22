export const getHttpBaseUrlFromWebSocketUrl = (wsUrl: string): string => {
  try {
    const parsed = new URL(wsUrl);
    if (parsed.protocol === "wss:") {
      return `https://${parsed.host}`;
    }
    if (parsed.protocol === "ws:") {
      return `http://${parsed.host}`;
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    if (wsUrl.startsWith("wss://")) {
      return `https://${wsUrl.slice("wss://".length)}`;
    }
    if (wsUrl.startsWith("ws://")) {
      return `http://${wsUrl.slice("ws://".length)}`;
    }
    return wsUrl;
  }
};

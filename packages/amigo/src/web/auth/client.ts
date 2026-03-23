import { createAuthClient } from "better-auth/react";
import { getHttpBaseUrlFromWebSocketUrl } from "../utils/sandboxEditor";

type RuntimeConfigWindow = Window &
  typeof globalThis & {
    __AMIGO_CONFIG__?: {
      wsUrl?: string;
    };
  };

const resolveWebSocketUrl = (): string => {
  const configuredUrl = ((window as RuntimeConfigWindow).__AMIGO_CONFIG__?.wsUrl || "").trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `ws://${window.location.hostname}:10013/ws`;
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws`;
};

export const authClient = createAuthClient({
  baseURL: `${getHttpBaseUrlFromWebSocketUrl(resolveWebSocketUrl())}/api/auth`,
  fetchOptions: {
    credentials: "include",
  },
});

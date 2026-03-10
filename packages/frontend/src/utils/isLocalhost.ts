export const isLocalhost = (): boolean => {
  if (typeof window === "undefined") {
    return true;
  }

  const hostname = window.location.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
};

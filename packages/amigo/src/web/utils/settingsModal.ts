const EVENT_NAME = "amigo:open-settings-modal";

export const openSettingsModal = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(EVENT_NAME));
};

export const subscribeOpenSettingsModal = (listener: () => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = () => listener();
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};

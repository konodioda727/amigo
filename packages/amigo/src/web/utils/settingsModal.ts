const OPEN_EVENT_NAME = "amigo:open-settings-modal";
const UPDATED_EVENT_NAME = "amigo:settings-updated";

export const openSettingsModal = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(OPEN_EVENT_NAME));
};

export const emitSettingsUpdated = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(UPDATED_EVENT_NAME));
};

export const subscribeOpenSettingsModal = (listener: () => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = () => listener();
  window.addEventListener(OPEN_EVENT_NAME, handler);
  return () => window.removeEventListener(OPEN_EVENT_NAME, handler);
};

export const subscribeSettingsUpdated = (listener: () => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = () => listener();
  window.addEventListener(UPDATED_EVENT_NAME, handler);
  return () => window.removeEventListener(UPDATED_EVENT_NAME, handler);
};

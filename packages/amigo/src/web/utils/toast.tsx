import hotToast from "react-hot-toast";

export const toast = {
  success: (message: string) => hotToast.success(message),
  error: (message: string) => hotToast.error(message),
  warning: (message: string) =>
    hotToast(message, {
      icon: "⚠️",
      style: {
        background: "#fef3c7",
        color: "#92400e",
      },
    }),
  info: (message: string) =>
    hotToast(message, {
      icon: "ℹ️",
      style: {
        background: "#dbeafe",
        color: "#1e40af",
      },
    }),
};

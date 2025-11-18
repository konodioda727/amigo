import type { DisplayMessageType } from "@/messages/types";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

export const AlertRenderer = ({ message }: { message: DisplayMessageType }) => {
  if (message.type !== "alert") return null;

  const alertData = message.data as {
    message: string;
    severity: "info" | "warning" | "error";
  };

  const severityConfig = {
    info: {
      icon: Info,
      bgColor: "bg-info/10",
      borderColor: "border-info",
      textColor: "text-info",
      iconColor: "text-info",
    },
    warning: {
      icon: AlertTriangle,
      bgColor: "bg-warning/10",
      borderColor: "border-warning",
      textColor: "text-warning",
      iconColor: "text-warning",
    },
    error: {
      icon: AlertCircle,
      bgColor: "bg-error/10",
      borderColor: "border-error",
      textColor: "text-error",
      iconColor: "text-error",
    },
  };

  const config = severityConfig[alertData.severity];
  const Icon = config.icon;

  return (
    <div className="chat chat-start mb-4">
      <div
        className={`alert ${config.bgColor} ${config.borderColor} border-2 shadow-lg`}
      >
        <Icon className={`w-6 h-6 ${config.iconColor} flex-shrink-0`} />
        <div className="flex-1">
          <h3 className={`font-bold ${config.textColor} mb-1`}>
            {alertData.severity === "error" && "错误"}
            {alertData.severity === "warning" && "警告"}
            {alertData.severity === "info" && "提示"}
          </h3>
          <div className="text-sm whitespace-pre-wrap">{alertData.message}</div>
        </div>
      </div>
    </div>
  );
};

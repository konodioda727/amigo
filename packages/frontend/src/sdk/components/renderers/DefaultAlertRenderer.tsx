import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import type React from "react";
import type { AlertRendererProps } from "../../types/renderers";

/**
 * Default renderer for alert message type
 */
export const DefaultAlertRenderer: React.FC<AlertRendererProps> = ({
  message,
  taskId: _taskId,
  isLatest: _isLatest,
}) => {
  const alertData = message.data;

  const severityConfig = {
    info: {
      icon: Info,
      bgColor: "bg-info/10",
      textColor: "text-info",
    },
    warning: {
      icon: AlertTriangle,
      bgColor: "bg-warning/10",
      textColor: "text-warning",
    },
    error: {
      icon: AlertCircle,
      bgColor: "bg-error/10",
      textColor: "text-error",
    },
  };

  const config = severityConfig[alertData.severity];
  const Icon = config.icon;

  return (
    <div className="flex justify-center w-full mb-3">
      {/* 系统消息样式 - 居中显示 */}
      <div
        className={`flex items-center gap-2 px-3 py-2 ${config.bgColor} rounded-lg ${config.textColor} text-xs max-w-[80%]`}
      >
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="whitespace-pre-wrap">{alertData.message}</span>
      </div>
    </div>
  );
};

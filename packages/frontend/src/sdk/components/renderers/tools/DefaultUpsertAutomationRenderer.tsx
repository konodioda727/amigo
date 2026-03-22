import { Clock3 } from "lucide-react";
import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";

type UpsertAutomationMessage = ToolMessageRendererProps<any>["message"] & {
  params?: {
    id?: string;
    name?: string;
    enabled?: boolean;
    schedule?: {
      type?: string;
      everyMinutes?: number;
      hour?: number;
      minute?: number;
      weekday?: number;
    };
  };
  toolOutput?: {
    action?: string;
    message?: string;
    automation?: {
      id?: string;
      name?: string;
      enabled?: boolean;
      nextRunAt?: string;
    };
  };
};

const formatSchedule = (schedule: UpsertAutomationMessage["params"]["schedule"]): string => {
  if (!schedule?.type) {
    return "未提供调度信息";
  }
  if (schedule.type === "interval") {
    return `每 ${schedule.everyMinutes ?? "-"} 分钟`;
  }
  const hour = String(schedule.hour ?? 0).padStart(2, "0");
  const minute = String(schedule.minute ?? 0).padStart(2, "0");
  if (schedule.type === "daily") {
    return `每天 ${hour}:${minute}`;
  }
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${weekdays[schedule.weekday ?? 0] || "每周"} ${hour}:${minute}`;
};

export const DefaultUpsertAutomationRenderer: React.FC<ToolMessageRendererProps<any>> = ({
  message,
}) => {
  const { error, hasError, partial } = message;
  const typedMessage = message as UpsertAutomationMessage;
  const isCompleted = typedMessage.toolOutput !== undefined;
  const isLoading = partial === true;
  const automationName =
    typedMessage.toolOutput?.automation?.name ||
    typedMessage.params?.name ||
    typedMessage.params?.id ||
    "未命名 automation";
  const action = typedMessage.toolOutput?.action || (typedMessage.params?.id ? "更新" : "创建");

  return (
    <ToolAccordion
      icon={<Clock3 size={14} />}
      title={`${action}自动化【${automationName}】`}
      isLoading={isLoading}
      hasError={hasError}
      error={error}
    >
      {isCompleted ? (
        <div className="space-y-2 text-xs text-neutral-500">
          {typedMessage.toolOutput?.message ? <div>{typedMessage.toolOutput.message}</div> : null}
          <div>调度: {formatSchedule(typedMessage.params?.schedule)}</div>
          <div>状态: {typedMessage.toolOutput?.automation?.enabled ? "已启用" : "已停用"}</div>
          {typedMessage.toolOutput?.automation?.nextRunAt ? (
            <div>
              下次运行: {new Date(typedMessage.toolOutput.automation.nextRunAt).toLocaleString()}
            </div>
          ) : null}
        </div>
      ) : null}
    </ToolAccordion>
  );
};

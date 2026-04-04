import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";

export const DefaultExecuteTaskListRenderer: React.FC<
  ToolMessageRendererProps<"executeTaskList">
> = ({ message }) => {
  const { toolOutput, error, hasError, partial } = message;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;
  const executionId =
    toolOutput && typeof toolOutput === "object" && typeof toolOutput.executionId === "string"
      ? toolOutput.executionId
      : "";
  const status =
    toolOutput && typeof toolOutput === "object" && typeof toolOutput.status === "string"
      ? toolOutput.status
      : "";
  const startedAt =
    toolOutput && typeof toolOutput === "object" && typeof toolOutput.startedAt === "string"
      ? toolOutput.startedAt
      : "";
  const summary = status === "already_running" ? "已有后台执行任务在运行" : "已启动后台执行任务";

  return (
    <ToolAccordion title="执行任务列表" isLoading={isLoading} hasError={hasError} error={error}>
      {isCompleted && (
        <div className="space-y-1 text-sm text-neutral-700">
          <div>{summary}</div>
          {executionId && <div className="text-xs text-neutral-500">任务编号: {executionId}</div>}
          {startedAt && <div className="text-xs text-neutral-500">启动时间: {startedAt}</div>}
        </div>
      )}
    </ToolAccordion>
  );
};

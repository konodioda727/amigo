import { CheckSquare } from "lucide-react";
import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";

export const DefaultExecuteTaskListRenderer: React.FC<
  ToolMessageRendererProps<"executeTaskList">
> = ({ message }) => {
  const { toolOutput, error, hasError, partial } = message;
  const isCompleted = !!toolOutput;
  const isLoading = partial !== undefined ? partial : !isCompleted;

  return (
    <ToolAccordion
      icon={<CheckSquare size={14} />}
      title="执行任务列表"
      isLoading={isLoading}
      hasError={hasError}
      error={error}
    >
      {isCompleted && <div>已开始执行任务列表</div>}
    </ToolAccordion>
  );
};

import { ListTodo } from "lucide-react";
import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";

export const DefaultGetTaskListProgressRenderer: React.FC<
  ToolMessageRendererProps<"getTaskListProgress">
> = ({ message }) => {
  const { toolOutput, error, hasError, partial } = message;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;

  return (
    <ToolAccordion
      icon={<ListTodo size={14} />}
      title="获取任务进度"
      isLoading={isLoading}
      hasError={hasError}
      error={error}
    >
      {isCompleted && <div>已获取任务进度信息</div>}
    </ToolAccordion>
  );
};

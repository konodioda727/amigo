import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";

export const DefaultUpdateTaskDocsRenderer: React.FC<
  ToolMessageRendererProps<"updateTaskDocs">
> = ({ message }) => {
  const { toolOutput, error, hasError, partial } = message;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;

  return (
    <ToolAccordion title="更新任务文档" isLoading={isLoading} hasError={hasError} error={error}>
      {isCompleted && <div>文档更新成功</div>}
    </ToolAccordion>
  );
};

import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";

export const DefaultReadTaskDocsRenderer: React.FC<ToolMessageRendererProps<"readTaskDocs">> = ({
  message,
}) => {
  const { toolOutput, error, hasError, partial } = message;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;

  return (
    <ToolAccordion title="读取任务文档" isLoading={isLoading} hasError={hasError} error={error}>
      {isCompleted && <div>文档已读取</div>}
    </ToolAccordion>
  );
};

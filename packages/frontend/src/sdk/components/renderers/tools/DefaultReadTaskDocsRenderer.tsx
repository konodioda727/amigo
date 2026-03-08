import { BookOpen } from "lucide-react";
import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";

export const DefaultReadTaskDocsRenderer: React.FC<ToolMessageRendererProps<"readTaskDocs">> = ({
  message,
}) => {
  const { toolOutput, error, hasError, partial } = message;
  const isCompleted = !!toolOutput;
  const isLoading = partial !== undefined ? partial : !isCompleted;

  return (
    <ToolAccordion
      icon={<BookOpen size={14} />}
      title="读取任务文档"
      isLoading={isLoading}
      hasError={hasError}
      error={error}
    >
      {isCompleted && <div>文档已读取</div>}
    </ToolAccordion>
  );
};

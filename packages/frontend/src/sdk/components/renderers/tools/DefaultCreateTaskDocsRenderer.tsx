import { FilePlus2 } from "lucide-react";
import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";

export const DefaultCreateTaskDocsRenderer: React.FC<
  ToolMessageRendererProps<"createTaskDocs">
> = ({ message }) => {
  const { toolOutput, error, hasError, partial } = message;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;

  return (
    <ToolAccordion
      icon={<FilePlus2 size={14} />}
      title="创建任务文档"
      isLoading={isLoading}
      hasError={hasError}
      error={error}
    >
      {isCompleted && <div>文档创建成功</div>}
    </ToolAccordion>
  );
};

import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";
import { ToolCodeBlock } from "./ToolCodeBlock";

export const DefaultBashRenderer: React.FC<ToolMessageRendererProps<"bash">> = ({ message }) => {
  const { params, toolOutput, error, hasError, partial } = message;
  const { command } = params;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;

  return (
    <ToolAccordion
      title={`执行命令: ${command}`}
      isLoading={isLoading}
      hasError={hasError}
      error={error}
    >
      {isCompleted && <ToolCodeBlock command={command} output={toolOutput?.output} />}
    </ToolAccordion>
  );
};

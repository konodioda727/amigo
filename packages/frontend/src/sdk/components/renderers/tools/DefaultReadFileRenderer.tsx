import { FileText } from "lucide-react";
import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";

export const ReadFileResultBody: React.FC<ToolMessageRendererProps<"readFile">> = ({ message }) => {
  const readContent = message.toolOutput?.content || "";

  if (!message.toolOutput) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-neutral-500">{message.toolOutput.message}</div>
      <pre className="max-h-80 overflow-auto rounded-lg bg-neutral-950 p-3 text-xs text-neutral-100">
        <code>{readContent || "文件为空"}</code>
      </pre>
    </div>
  );
};

export const DefaultReadFileRenderer: React.FC<ToolMessageRendererProps<"readFile">> = ({
  message,
}) => {
  const { params, toolOutput, error, hasError, partial } = message;
  const isCompleted = !!toolOutput;
  const isLoading = partial !== undefined ? partial : !isCompleted;

  return (
    <ToolAccordion
      icon={<FileText size={14} />}
      title={`读取文件: ${params.filePath}`}
      isLoading={isLoading}
      hasError={hasError}
      error={error}
    >
      {isCompleted && <ReadFileResultBody message={message} isLatest={false} />}
    </ToolAccordion>
  );
};

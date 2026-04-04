import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";

export const ReadFileResultBody: React.FC<ToolMessageRendererProps<"readFile">> = ({ message }) => {
  if (!message.toolOutput) {
    return null;
  }

  const files = Array.isArray(message.toolOutput.files) ? message.toolOutput.files : [];

  return (
    <div className="space-y-2">
      <div className="text-xs text-neutral-500">{message.toolOutput.message}</div>
      {files.map((file) => (
        <div key={file.filePath} className="space-y-2">
          <div className="text-xs font-medium text-neutral-700">{file.filePath}</div>
          <div className="text-xs text-neutral-500">{file.message}</div>
          <pre className="overflow-x-auto rounded-lg bg-neutral-950 p-3 text-xs text-neutral-100">
            <code>{file.content || "文件为空"}</code>
          </pre>
        </div>
      ))}
    </div>
  );
};

export const DefaultReadFileRenderer: React.FC<ToolMessageRendererProps<"readFile">> = ({
  message,
}) => {
  const { params, toolOutput, error, hasError, partial } = message;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;
  const filePaths = Array.isArray(params.filePaths) ? params.filePaths : [];
  const title =
    filePaths.length === 1 ? `读取文件: ${filePaths[0]}` : `读取文件: ${filePaths.length} 个`;

  return (
    <ToolAccordion title={title} isLoading={isLoading} hasError={hasError} error={error}>
      {isCompleted && <ReadFileResultBody message={message} isLatest={false} />}
    </ToolAccordion>
  );
};

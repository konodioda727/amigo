import { Terminal } from "lucide-react";
import type React from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";
import { ToolAccordion } from "./ToolAccordion";

export const DefaultBashRenderer: React.FC<ToolMessageRendererProps<"bash">> = ({ message }) => {
  const { params, toolOutput, error, hasError, partial } = message;
  const { command } = params;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;

  return (
    <ToolAccordion
      icon={<Terminal size={14} />}
      title={`执行命令: ${command}`}
      isLoading={isLoading}
      hasError={hasError}
      error={error}
    >
      {isCompleted && (
        <div className="bg-[#1e1e1e] text-gray-300 px-3 py-2 rounded font-mono text-xs overflow-x-auto">
          <div className="text-green-400 mb-1">$ {command}</div>
          {toolOutput?.output && (
            <div className="whitespace-pre-wrap break-all text-gray-300">{toolOutput.output}</div>
          )}
        </div>
      )}
    </ToolAccordion>
  );
};

import { CheckCircle, ChevronDown, ChevronRight, FilePlus, XCircle } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";

export const DefaultCreateTaskDocsRenderer: React.FC<
  ToolMessageRendererProps<"createTaskDocs">
> = ({ message }) => {
  const { params, toolOutput, error, hasError } = message;
  const { phase, content } = params;
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="my-2 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm max-w-3xl">
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center justify-between gap-2 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <FilePlus className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="font-semibold text-sm text-gray-900">Create Task Doc</span>
          <div className="w-px h-4 bg-gray-200 m-0" />
          <span className="font-mono text-xs truncate text-gray-500">{phase}</span>
        </div>
        <div>
          {hasError ? (
            <XCircle className="w-4 h-4 text-red-500" />
          ) : toolOutput?.success ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : null}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-3 bg-white border-t border-gray-200 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-widest">
            Document Content:
          </div>
          <div className="relative group">
            <pre className="bg-gray-50 text-gray-700 rounded-xl p-3 text-xs font-mono font-medium overflow-x-auto max-h-80 custom-scrollbar whitespace-pre-wrap border border-gray-200">
              {content}
            </pre>
          </div>

          {/* Result */}
          {hasError ? (
            <div className="mt-2 text-xs text-red-600 font-medium bg-red-50 p-2 rounded-xl border border-red-100 flex items-start gap-2">
              <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{error || "Failed to create document"}</span>
            </div>
          ) : toolOutput ? (
            toolOutput.message && (
              <div className="mt-2 text-xs text-green-600 font-medium bg-green-50 p-2 rounded-xl border border-green-100 flex items-center gap-2">
                <CheckCircle className="w-3 h-3 flex-shrink-0" />
                <span>{toolOutput.message}</span>
                {toolOutput.filePath && (
                  <span className="opacity-50 ml-auto font-mono text-[10px]">
                    {toolOutput.filePath}
                  </span>
                )}
              </div>
            )
          ) : (
            <div className="text-xs text-gray-400 italic py-2">Creating document...</div>
          )}
        </div>
      )}
    </div>
  );
};

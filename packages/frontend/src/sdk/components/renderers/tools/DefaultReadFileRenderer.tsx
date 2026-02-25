import { CheckCircle, ChevronDown, ChevronRight, FileSearch, XCircle } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";

export const DefaultReadFileRenderer: React.FC<ToolMessageRendererProps<"readFile">> = ({
  message,
}) => {
  const { params, toolOutput, error, hasError } = message;
  const { filePath, startLine, endLine } = params;
  const [isExpanded, setIsExpanded] = useState(false);

  const fileName = filePath ? filePath.split("/").pop() || filePath : "";

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
          <FileSearch className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="font-semibold text-sm text-gray-900">Read File</span>
          <div className="w-px h-4 bg-gray-200 m-0" />
          <span className="font-mono text-xs truncate text-gray-500" title={filePath}>
            {isExpanded ? filePath : fileName}
          </span>
        </div>
        <div>
          {hasError ? (
            <XCircle className="w-4 h-4 text-red-500" />
          ) : toolOutput ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : null}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-3 bg-white border-t border-gray-200 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Range Info */}
          {(startLine !== undefined || endLine !== undefined) && (
            <div className="text-xs text-gray-500 mb-2 font-medium font-mono bg-gray-50 p-1.5 rounded-lg border border-gray-200">
              Lines: {startLine ?? "Start"} - {endLine ?? "End"}
            </div>
          )}

          {/* File Content */}
          {toolOutput?.content ? (
            <div className="relative group">
              <pre className="bg-gray-50 text-gray-700 rounded-xl p-3 text-xs font-mono overflow-x-auto max-h-80 custom-scrollbar whitespace-pre border border-gray-200">
                {toolOutput.content}
              </pre>
              {toolOutput.totalLines && (
                <div className="absolute top-2 right-2 px-1.5 py-0.5 border border-gray-200 rounded text-[8px] font-medium bg-gray-100 text-gray-500 opacity-70">
                  Total lines: {toolOutput.totalLines}
                </div>
              )}
            </div>
          ) : hasError ? (
            <div className="text-xs text-red-600 font-medium bg-red-50 p-2 rounded-xl border border-red-100 flex items-start gap-2">
              <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{error || "Failed to read file"}</span>
            </div>
          ) : (
            <div className="text-xs text-gray-400 italic py-2">Reading file...</div>
          )}
        </div>
      )}
    </div>
  );
};

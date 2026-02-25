import { CheckCircle, ChevronDown, ChevronRight, FileEdit, XCircle } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";

export const DefaultEditFileRenderer: React.FC<ToolMessageRendererProps<"editFile">> = ({
  message,
}) => {
  const { params, toolOutput, error, hasError } = message;
  const { filePath, content, mode = "overwrite", startLine, endLine } = params;
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
          <FileEdit className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="font-semibold text-sm text-gray-900">Edit File</span>
          <div className="w-px h-4 bg-gray-200 m-0" />
          <span className="font-mono text-xs truncate text-gray-500" title={filePath}>
            {isExpanded ? filePath : fileName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {mode === "patch" ? (
            <span className="px-2 py-0.5 border border-yellow-200 rounded-full text-[10px] font-medium bg-yellow-50 text-yellow-700">
              Patch
            </span>
          ) : mode === "create" ? (
            <span className="px-2 py-0.5 border border-green-200 rounded-full text-[10px] font-medium bg-green-50 text-green-700">
              Create
            </span>
          ) : (
            <span className="px-2 py-0.5 border border-blue-200 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">
              Overwrite
            </span>
          )}
          {hasError && <XCircle className="w-4 h-4 text-red-500" />}
          {!hasError && toolOutput && <CheckCircle className="w-4 h-4 text-green-500" />}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-3 bg-white border-t border-gray-200 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Patch Info */}
          {mode === "patch" && (startLine !== undefined || endLine !== undefined) && (
            <div className="text-xs text-gray-500 mb-2 font-medium font-mono bg-gray-50 p-1.5 rounded-lg border border-gray-200">
              Range: Line {startLine ?? "?"} - {endLine ?? "?"}
            </div>
          )}

          <div className="relative">
            <div className="absolute top-0 right-0 p-1">
              <div className="px-1.5 py-0.5 border border-gray-200 rounded text-[8px] font-medium bg-white text-gray-400">
                CONTENT
              </div>
            </div>
            <pre className="bg-gray-50 rounded-xl p-3 text-xs font-mono overflow-x-auto max-h-60 custom-scrollbar whitespace-pre text-gray-700 border border-gray-200">
              {content}
            </pre>
          </div>

          {/* Error or Result Message */}
          {hasError && error && (
            <div className="mt-2 text-xs text-red-600 font-medium bg-red-50 p-2 rounded-xl border border-red-100 flex items-start gap-2">
              <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {toolOutput?.message && !hasError && (
            <div className="mt-2 text-xs text-green-600 font-medium bg-green-50 p-2 rounded-xl border border-green-100">
              {toolOutput.message}
              {toolOutput.linesWritten !== undefined &&
                ` (${toolOutput.linesWritten} lines written)`}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import { BookOpen, CheckCircle, ChevronDown, ChevronRight, XCircle } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";

export const DefaultReadTaskDocsRenderer: React.FC<ToolMessageRendererProps<"readTaskDocs">> = ({
  message,
}) => {
  const { params, toolOutput, error, hasError } = message;
  const { taskName, phase } = params;
  const [isExpanded, setIsExpanded] = useState(false);

  const renderDocContent = (title: string, content?: string) => {
    if (!content) return null;
    return (
      <div className="mt-3 first:mt-0">
        <div className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">
          {title}
        </div>
        <pre className="bg-gray-50 text-gray-700 rounded-xl p-3 text-xs font-mono overflow-x-auto max-h-60 custom-scrollbar whitespace-pre-wrap border border-gray-200">
          {content}
        </pre>
      </div>
    );
  };

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
          <BookOpen className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="font-semibold text-sm text-gray-900">Read Task Docs</span>
          <div className="w-px h-4 bg-gray-200 m-0" />
          <span className="font-mono text-xs truncate text-gray-500">
            {taskName} ({phase})
          </span>
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
          {toolOutput?.documents ? (
            <div className="flex flex-col gap-2">
              {renderDocContent("Requirements", toolOutput.documents.requirements)}
              {renderDocContent("Design", toolOutput.documents.design)}
              {renderDocContent("Task List", toolOutput.documents.taskList)}
              {/* Fallback if all empty but success */}
              {!toolOutput.documents.requirements &&
                !toolOutput.documents.design &&
                !toolOutput.documents.taskList && (
                  <div className="text-xs text-gray-400 italic">No content found.</div>
                )}
            </div>
          ) : hasError ? (
            <div className="text-xs text-red-600 font-medium bg-red-50 p-2 rounded-xl border border-red-100 flex items-start gap-2">
              <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{error || "Failed to read documents"}</span>
            </div>
          ) : (
            <div className="text-xs text-gray-400 italic py-2">Reading documents...</div>
          )}
        </div>
      )}
    </div>
  );
};

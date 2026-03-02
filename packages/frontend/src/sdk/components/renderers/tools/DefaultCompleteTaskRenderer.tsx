import { CheckCircle, CheckSquare, ChevronDown, ChevronRight, XCircle } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";

export const DefaultCompleteTaskRenderer: React.FC<ToolMessageRendererProps<"completeTask">> = ({
  message,
}) => {
  const { params, toolOutput, error, hasError } = message;
  const [isExpanded, setIsExpanded] = useState(false);

  const isCompleted = !!toolOutput || hasError;

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
          <CheckSquare className="w-4 h-4 text-green-500 flex-shrink-0" />
          <span className="font-semibold text-sm text-gray-900">完成子任务</span>
        </div>
        <div className="flex items-center gap-2">
          {hasError ? (
            <XCircle className="w-4 h-4 text-red-500" />
          ) : isCompleted ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : (
            <span className="flex w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          )}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-3 bg-white border-t border-gray-200 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="space-y-3">
            {/* Summary */}
            {params?.summary && (
              <div>
                <div className="text-xs text-gray-400 mb-1 font-medium uppercase tracking-widest">
                  摘要：
                </div>
                <div className="text-sm text-gray-700">{params.summary}</div>
              </div>
            )}

            {/* Achievements */}
            {params?.achievements && (
              <div>
                <div className="text-xs text-gray-400 mb-1 font-medium uppercase tracking-widest">
                  关键成果：
                </div>
                <div className="text-sm text-gray-700 bg-gray-50 p-2 rounded-lg border border-gray-100 whitespace-pre-wrap">
                  {params.achievements}
                </div>
              </div>
            )}

            {/* Usage */}
            {params?.usage && (
              <div>
                <div className="text-xs text-gray-400 mb-1 font-medium uppercase tracking-widest">
                  使用说明：
                </div>
                <div className="text-sm text-gray-700 bg-blue-50/50 p-2 rounded-lg border border-blue-100 whitespace-pre-wrap">
                  {params.usage}
                </div>
              </div>
            )}

            {/* Detailed Result */}
            {params?.result && (
              <div>
                <div className="text-xs text-gray-400 mb-1 font-medium uppercase tracking-widest">
                  详细结果：
                </div>
                <div className="text-sm text-gray-700 bg-gray-50 p-2 rounded-lg border border-gray-100 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono text-xs">
                  {params.result}
                </div>
              </div>
            )}

            {/* Error Message */}
            {hasError && (
              <div className="text-xs text-red-600 font-medium bg-red-50 p-2 rounded-xl border border-red-100 flex items-start gap-2">
                <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>{error || "完成任务失败"}</span>
              </div>
            )}

            {/* Success Status */}
            {!hasError && isCompleted && (
              <div className="mt-2 text-xs text-gray-500 italic flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                已通知父任务
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

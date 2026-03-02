import { Activity, CheckCircle, ChevronDown, ChevronRight, ListTodo, XCircle } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";

export const DefaultGetTaskListProgressRenderer: React.FC<
  ToolMessageRendererProps<"getTaskListProgress">
> = ({ message }) => {
  const { toolOutput, error, hasError } = message;
  const [isExpanded, setIsExpanded] = useState(false);

  const isCompleted = !!toolOutput || hasError;
  const progress = toolOutput?.progress;

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
          <Activity className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span className="font-semibold text-sm text-gray-900">获取任务进度</span>
          {progress && (
            <div className="flex items-center gap-2 ml-2">
              <span className="px-1.5 py-0.5 border border-gray-200 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                进度: {Math.round(progress.percentage)}%
              </span>
              <span className="text-[10px] text-gray-500">
                {progress.completed}/{progress.total}
              </span>
            </div>
          )}
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
            {/* Progress Bar */}
            {progress && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>完成度</span>
                  <span>{Math.round(progress.percentage)}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
              </div>
            )}

            {/* Pending Tasks */}
            {toolOutput?.pendingTasks && toolOutput.pendingTasks.length > 0 && (
              <div>
                <div className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-widest flex items-center gap-1">
                  <ListTodo className="w-3 h-3" />
                  待完成任务 ({toolOutput.pendingTasks.length})
                </div>
                <div className="space-y-1">
                  {toolOutput.pendingTasks.map((task, idx) => (
                    <div
                      key={`pending-${task.substring(0, 10)}-${idx}`}
                      className="text-xs text-gray-700 bg-orange-50/50 p-2 rounded-lg border border-orange-100 flex items-start gap-2"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
                      <span className="whitespace-pre-wrap">{task}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Completed Tasks */}
            {toolOutput?.completedTasks && toolOutput.completedTasks.length > 0 && (
              <div>
                <div className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-widest flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  已完成任务 ({toolOutput.completedTasks.length})
                </div>
                <div className="space-y-1">
                  {toolOutput.completedTasks.map((task, idx) => (
                    <div
                      key={`completed-${task.substring(0, 10)}-${idx}`}
                      className="text-xs text-gray-500 bg-gray-50 p-2 rounded-lg border border-gray-100 flex items-start gap-2 line-through opacity-70"
                    >
                      <CheckCircle className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="whitespace-pre-wrap">{task}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All Completed Message */}
            {toolOutput?.isAllCompleted && (
              <div className="text-xs text-green-600 font-medium bg-green-50 p-2 rounded-xl border border-green-100 flex items-center gap-2">
                <CheckCircle className="w-3 h-3 flex-shrink-0" />
                <span>所有任务已完成！</span>
              </div>
            )}

            {/* General Message */}
            {toolOutput?.message && !toolOutput.isAllCompleted && !hasError && (
              <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded-xl border border-gray-200">
                {toolOutput.message}
              </div>
            )}

            {/* Error Message */}
            {hasError && (
              <div className="text-xs text-red-600 font-medium bg-red-50 p-2 rounded-xl border border-red-100 flex items-start gap-2">
                <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>{error || "获取任务进度失败"}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

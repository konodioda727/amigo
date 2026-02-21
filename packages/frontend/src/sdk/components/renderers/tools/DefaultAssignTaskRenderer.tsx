import { AlertCircle, CheckCircle, ChevronDown, ChevronRight } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";

/**
 * Default renderer for assignTasks tool
 *
 * Note: This is a simplified version that doesn't render subtasks.
 * For full subtask rendering, consumers should provide a custom renderer
 * that integrates with their task management system.
 */
export const DefaultAssignTaskRenderer: React.FC<ToolMessageRendererProps<"assignTasks">> = ({
  message,
  taskId: _taskId,
  isLatest: _isLatest,
}) => {
  const { params, toolOutput, error, hasError } = message;
  const [isExpanded, setIsExpanded] = useState(true);

  // If there's an error, show concise error message
  if (hasError && error) {
    return (
      <div className="flex items-start gap-2 py-2 text-error text-sm">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>任务分配失败：{error}</span>
      </div>
    );
  }

  const tasklist = (params.tasklist || []) as Array<{
    target: string;
    subAgentPrompt: string;
    tools: string[];
    taskId?: string;
  }>;

  const isCompleted = !!toolOutput;

  return (
    <div className="my-3 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm max-w-3xl">
      {/* Title row - collapsible */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-3 py-2 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <span className="font-semibold text-sm text-gray-900">分配任务</span>
          <span className="px-1.5 py-0.5 border border-gray-200 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
            {tasklist.length}
          </span>
        </div>
        {isCompleted && <CheckCircle className="w-4 h-4 text-green-500" />}
      </button>

      {/* Task list */}
      {isExpanded && (
        <div className="p-3 bg-white border-t border-gray-200 space-y-2">
          {tasklist.map((item, idx) => {
            const subTaskId = item.taskId;

            return (
              <div
                key={`task-${item.taskId}`}
                className="p-2 border border-gray-100 rounded-lg bg-gray-50/50"
              >
                <div className="text-xs text-gray-900 font-medium flex items-center gap-2">
                  <span className="w-5 h-5 flex items-center justify-center bg-gray-800 text-white rounded-full shrink-0 text-[10px]">
                    {idx + 1}
                  </span>
                  <span className="truncate">{item.target}</span>
                  {subTaskId && (
                    <span className="ml-auto text-[10px] text-gray-400 font-mono">
                      ID: {subTaskId}
                    </span>
                  )}
                  {!subTaskId && (
                    <span className="ml-auto text-[10px] text-gray-400 italic font-medium">
                      等待中...
                    </span>
                  )}
                </div>
                {item.tools && item.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 pl-7">
                    {item.tools.map((tool) => (
                      <span
                        key={tool}
                        className="px-1.5 py-0.5 border border-gray-200 rounded text-[8px] font-medium text-gray-500 bg-white"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && !hasError && (
        <div className="px-3 py-2 border-t border-red-100 bg-red-50 flex items-center gap-2 text-red-600 text-[10px] font-medium">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

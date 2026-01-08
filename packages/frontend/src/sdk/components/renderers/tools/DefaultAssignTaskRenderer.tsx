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
    <div className="py-2">
      {/* Title row - collapsible */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 cursor-pointer mb-2"
      >
        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <span className="font-medium">分配任务</span>
        <span className="text-neutral-400">({tasklist.length})</span>
        {isCompleted && <CheckCircle className="w-3.5 h-3.5 text-success" />}
      </button>

      {/* Task list */}
      {isExpanded && (
        <div className="space-y-3 pl-6 border-l-2 border-neutral-200">
          {tasklist.map((item, idx) => {
            const subTaskId = item.taskId;

            return (
              <div key={`task-${item.taskId}`} className="py-1">
                <div className="text-sm text-neutral-700">
                  <span className="font-medium">#{idx + 1}</span>
                  <span className="mx-2">·</span>
                  <span>{item.target}</span>
                  {subTaskId && (
                    <span className="ml-2 text-xs text-neutral-400">ID: {subTaskId}</span>
                  )}
                  {!subTaskId && <span className="ml-2 text-xs text-neutral-400">等待中...</span>}
                </div>
                {item.tools && item.tools.length > 0 && (
                  <div className="text-xs text-neutral-500 mt-1">工具: {item.tools.join(", ")}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && !hasError && (
        <div className="flex items-center gap-2 text-error text-xs mt-2 pl-6">
          <AlertCircle className="w-3 h-3" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

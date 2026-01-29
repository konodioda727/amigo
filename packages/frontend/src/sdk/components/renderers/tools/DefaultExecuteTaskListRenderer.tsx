import { CheckCircle, ChevronDown, ChevronRight, ListTodo, XCircle } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { ToolMessageRendererProps } from "../../../types/renderers";

export const DefaultExecuteTaskListRenderer: React.FC<
  ToolMessageRendererProps<"executeTaskList">
> = ({ message }) => {
  const { toolOutput, error, hasError } = message;
  const [isExpanded, setIsExpanded] = useState(false);

  const executionResults = toolOutput?.executionResults || [];
  const isCompleted = !!toolOutput;
  const hasExecuted = toolOutput?.executed !== false;

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
          <ListTodo className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="font-semibold text-sm text-gray-900">执行任务列表</span>
          {isCompleted && hasExecuted && (
            <span className="px-1.5 py-0.5 border border-gray-200 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
              {executionResults.length} 个任务
            </span>
          )}
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
          {/* Execution Results */}
          {executionResults.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-widest">
                执行结果：
              </div>
              {executionResults.map((result: any, index: number) => (
                <div
                  key={result.target}
                  className="p-2 border border-gray-100 rounded-lg bg-gray-50/50"
                >
                  <div className="text-xs text-gray-900 font-medium flex items-center gap-2">
                    <span className="w-5 h-5 flex items-center justify-center bg-gray-800 text-white rounded-full shrink-0 text-[10px]">
                      {index + 1}
                    </span>
                    <span className="truncate">{result.target}</span>
                  </div>
                  <div className="mt-2 pl-7 text-xs text-gray-600 whitespace-pre-wrap">
                    {result.summary}
                  </div>
                  {(result.requestedTools !== undefined || result.availableTools !== undefined) && (
                    <div className="mt-2 pl-7 flex items-center gap-2 text-[10px] text-gray-400">
                      <span>请求工具: {result.requestedTools ?? 0}</span>
                      <span className="text-gray-300">|</span>
                      <span>可用工具: {result.availableTools ?? 0}</span>
                    </div>
                  )}
                  {result.invalidTools && result.invalidTools.length > 0 && (
                    <div className="mt-2 pl-7 flex flex-wrap gap-1">
                      {result.invalidTools.map((tool: string) => (
                        <span
                          key={tool}
                          className="px-1.5 py-0.5 border border-red-200 rounded text-[8px] font-medium text-red-500 bg-red-50"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : hasError ? (
            <div className="text-xs text-red-600 font-medium bg-red-50 p-2 rounded-xl border border-red-100 flex items-start gap-2">
              <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{error || "执行任务列表失败"}</span>
            </div>
          ) : isCompleted && !hasExecuted ? (
            <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded-xl border border-gray-200">
              {toolOutput?.message || "没有待执行的任务"}
            </div>
          ) : (
            <div className="text-xs text-gray-400 italic py-2">正在执行任务列表...</div>
          )}

          {/* Success Message */}
          {toolOutput?.message && !hasError && isCompleted && hasExecuted && (
            <div className="mt-3 text-xs text-green-600 font-medium bg-green-50 p-2 rounded-xl border border-green-100 flex items-center gap-2">
              <CheckCircle className="w-3 h-3 flex-shrink-0" />
              <span>{toolOutput.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import { AlertCircle, CheckCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { NestingProvider } from "@/components/NestingContext";
import SubTaskRenderer from "@/components/SubTaskRenderer";
import type { ToolRendererProps } from ".";

const AssignTask: React.FC<ToolRendererProps<"assignTasks">> = (props) => {
  const { params, toolOutput, error, hasError } = props;
  const [isExpanded, setIsExpanded] = useState(true);

  // 如果有错误，显示简洁的错误信息
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
      {/* 标题行 - 可折叠 */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 cursor-pointer mb-2"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
        <span className="font-medium">分配任务</span>
        <span className="text-neutral-400">({tasklist.length})</span>
        {isCompleted && <CheckCircle className="w-3.5 h-3.5 text-success" />}
      </button>

      {/* 任务列表 */}
      {isExpanded && (
        <NestingProvider level={0}>
          <div className="space-y-3 pl-6 border-l-2 border-neutral-200">
            {tasklist.map((item, idx) => {
              const taskId = item.taskId;

              if (!taskId) {
                return (
                  <div key={`task-pending-${item.target}-${idx}`} className="py-1">
                    <div className="text-sm text-neutral-500">
                      <span className="font-medium text-neutral-700">#{idx + 1}</span>
                      <span className="mx-2">·</span>
                      <span>{item.target}</span>
                      <span className="ml-2 text-xs text-neutral-400">等待中...</span>
                    </div>
                  </div>
                );
              }

              return (
                <SubTaskRenderer
                  key={taskId}
                  taskId={taskId}
                  taskTarget={item.target}
                  taskIndex={idx}
                  tools={item.tools}
                  isCompleted={isCompleted}
                />
              );
            })}
          </div>
        </NestingProvider>
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

export default AssignTask;

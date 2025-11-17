import type { ToolRendererProps } from ".";
import { CheckCircle, Clock } from "lucide-react";
import SubTaskRenderer from "@/components/SubTaskRenderer";

const AssignTask: React.FC<ToolRendererProps<"assignTasks">> = (props) => {
  const { params, toolOutput, error, updateTime } = props;

  // 从 params 中获取 tasklist，每个 task 可能包含 taskId
  const tasklist = (params.tasklist || []) as Array<{
    target: string;
    subAgentPrompt: string;
    tools: string[];
    taskId?: string;
  }>;

  const isCompleted = !!toolOutput;

  return (
      <div className="flex flex-col items-center w-full">
        <div className="w-full max-w-4xl">
          <div className="font-bold text-lg mb-4 text-primary flex items-center gap-2">
            <span>分配任务工具</span>
            {isCompleted && (
              <span className="badge badge-success gap-1">
                <CheckCircle className="h-3 w-3" />
                已完成
              </span>
            )}
          </div>
          
          <div className="space-y-4">
            {tasklist.map((item, idx) => {
              const taskId = item.taskId;
              
              if (!taskId) {
                // 任务还没有分配 taskId，显示等待状态
                return (
                  <div
                    key={`task-pending-${item.target}-${idx}`}
                    className="card bg-base-100 shadow-xl border border-base-200"
                  >
                    <div className="card-body p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-base font-semibold text-primary">
                          任务 #{idx + 1}
                        </span>
                        <span className="badge badge-sm badge-warning">
                          <Clock className="h-3 w-3 animate-spin mr-1" />
                          等待中
                        </span>
                      </div>
                      <div className="mb-2">
                        <span className="font-bold text-accent text-sm">目标：</span>
                        <p className="text-sm mt-1">{item.target}</p>
                      </div>
                      <div className="text-xs text-base-content/50 mt-2 text-center">
                        等待任务分配...
                      </div>
                    </div>
                  </div>
                );
              }
              
              // 使用 SubTaskRenderer 渲染子任务（支持递归级联展示）
              // 每个子任务都有独立的 WebSocketProvider
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
        </div>
        
        {error && (
          <div className="mt-4 p-4 bg-error/10 rounded-lg border border-error/20 w-full max-w-4xl">
            <div className="font-bold text-error mb-2">错误</div>
            <p className="text-sm">{error}</p>
          </div>
        )}
        
        <div className="text-xs opacity-50 mt-2">
          {updateTime && new Date(updateTime).toLocaleTimeString()}
        </div>
      </div>
  );
};

export default AssignTask;

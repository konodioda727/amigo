import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { renderDisplayMessage } from "./renderers";
import { WebSocketProvider, useWebSocket } from "./WebSocketProvider";

interface SubTaskRendererProps {
  taskId: string;
  taskTarget: string;
  taskIndex: number;
  tools: string[];
  isCompleted: boolean;
}

/**
 * 子任务内容渲染器 - 在 WebSocketProvider 内部使用
 */
const SubTaskContent: React.FC<SubTaskRendererProps & { isExpanded: boolean; setIsExpanded: (expanded: boolean) => void }> = ({
  taskId,
  taskTarget,
  taskIndex,
  tools,
  isCompleted,
  isExpanded,
  setIsExpanded,
}) => {
  const { displayMessages, sendMessage } = useWebSocket();
  const taskStatus = isCompleted ? "completed" : "running";

  // 当展开时，加载子任务
  useEffect(() => {
    if (isExpanded) {
      sendMessage({ type: "loadTask", data: { taskId } });
    }
  }, [isExpanded, taskId, sendMessage]);

  // 检查是否有 followup question
  const hasFollowupQuestion = displayMessages.some(
    (msg) => msg.type === "askFollowupQuestion"
  );

  return (
    <div className="card bg-base-100 shadow-xl border border-base-200 transition-all">
      <div className="card-body p-4">
        {/* 任务头部 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-semibold text-primary">
              任务 #{taskIndex + 1}
            </span>
            {hasFollowupQuestion && (
              <span className="badge badge-sm badge-warning gap-1">
                <AlertCircle className="h-3 w-3" />
                等待回答
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`badge badge-sm ${
                taskStatus === "completed" ? "badge-success" : "badge-info"
              }`}
            >
              {taskStatus === "completed" ? "已完成" : "运行中"}
            </span>
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div className="mb-2">
          <span className="font-bold text-accent text-sm">目标：</span>
          <p className="text-sm mt-1">{taskTarget}</p>
        </div>

        <div className="mb-2">
          <span className="font-bold text-accent text-sm">工具：</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {tools && tools.length > 0 ? (
              tools.map((tool) => (
                <span key={`${taskId}-${tool}`} className="badge badge-info badge-sm">
                  {tool || "无"}
                </span>
              ))
            ) : (
              <span className="text-xs text-base-content/50">无工具</span>
            )}
          </div>
        </div>

        {/* 展开的消息区域 */}
        {isExpanded && (
          <div className="mt-4 border-t border-base-300 pt-4">
            <div className="bg-base-200/50 rounded-lg p-2 max-h-96 overflow-y-auto">
              {displayMessages.length > 0 ? (
                displayMessages.map((msg, idx) => {
                  // 使用 taskId + index 作为唯一 key，避免与其他子任务冲突
                  const element = renderDisplayMessage(msg);
                  if (!element) return null;
                  return <div key={`${taskId}-msg-${idx}`}>{element}</div>;
                })
              ) : (
                <div className="text-center text-sm text-base-content/50 py-4">
                  加载中...
                </div>
              )}
            </div>
          </div>
        )}

        <div className="text-xs text-base-content/50 mt-2">Task ID: {taskId}</div>
      </div>
    </div>
  );
};

/**
 * 子任务渲染器 - 套一个独立的 WebSocketProvider
 * 每个子任务都有自己的 WebSocket 上下文
 * 通过 loadTask 来加载对应的任务
 */
const SubTaskRenderer: React.FC<SubTaskRendererProps> = (props) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <WebSocketProvider>
      <SubTaskContent {...props} isExpanded={isExpanded} setIsExpanded={setIsExpanded} />
    </WebSocketProvider>
  );
};

export default SubTaskRenderer;

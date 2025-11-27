import { AlertCircle, CheckCircle, ChevronDown, ChevronRight, Loader } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { NestingProvider, useNesting } from "../NestingContext";
import { renderDisplayMessage } from "../MessageRenderers";
import { useWebSocketStore } from "@/store/websocket";
import { useSubTaskStatus } from "./hooks/useSubTaskStatus";

interface SubTaskRendererProps {
  taskId: string;
  taskTarget: string;
  taskIndex: number;
  tools: string[];
  isCompleted: boolean;
}

interface StatusIconProps {
  hasError: boolean;
  isCompleted: boolean;
  hasFollowupQuestion: boolean;
}

const StatusIcon: React.FC<StatusIconProps> = ({ hasError, isCompleted, hasFollowupQuestion }) => {
  if (hasError) return <AlertCircle className="w-3.5 h-3.5 text-error" />;
  if (isCompleted) return <CheckCircle className="w-3.5 h-3.5 text-success" />;
  if (hasFollowupQuestion) return <AlertCircle className="w-3.5 h-3.5 text-warning" />;
  return <Loader className="w-3.5 h-3.5 text-info animate-spin" />;
};

const SubTaskContent: React.FC<
  SubTaskRendererProps & { isExpanded: boolean; setIsExpanded: (expanded: boolean) => void }
> = ({ taskId, taskTarget, taskIndex, tools, isCompleted, isExpanded, setIsExpanded }) => {
  const taskState = useWebSocketStore((state) => state.tasks[taskId]);
  const registerTask = useWebSocketStore((state) => state.registerTask);
  const sendMessageAction = useWebSocketStore((state) => state.sendMessage);
  const { nestingLevel } = useNesting();

  const displayMessages = taskState?.displayMessages || [];
  const isLoading = taskState?.isLoading || false;

  const sendMessage = useCallback(
    (message: any) => sendMessageAction(taskId, message),
    [sendMessageAction, taskId]
  );

  useEffect(() => {
    if (!taskState) {
      registerTask(taskId);
    }
  }, [taskId, taskState, registerTask]);

  // 自动加载子任务状态（即使未展开）
  useEffect(() => {
    // 只在首次加载时发送 loadTask
    if (taskState && displayMessages.length === 0 && !isLoading) {
      sendMessage({ type: "loadTask", data: { taskId } });
    }
  }, [taskId, taskState, displayMessages.length, isLoading, sendMessage]);

  useEffect(() => {
    if (isExpanded) {
      sendMessage({ type: "loadTask", data: { taskId } });
    }
  }, [isExpanded, taskId, sendMessage]);

  const { hasFollowupQuestion, hasError } = useSubTaskStatus(displayMessages);

  // 当子任务有 followup question 时，自动展开
  useEffect(() => {
    if (hasFollowupQuestion && !isExpanded) {
      setIsExpanded(true);
    }
  }, [hasFollowupQuestion, isExpanded, setIsExpanded]);

  return (
    <div className="py-1">
      {/* 任务标题行 */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm w-full text-left hover:bg-neutral-50 rounded px-1 -mx-1 cursor-pointer"
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        )}
        <span className="font-medium text-neutral-700 shrink-0">#{taskIndex + 1}</span>
        <div className="shrink-0">
          <StatusIcon hasError={hasError} isCompleted={isCompleted} hasFollowupQuestion={hasFollowupQuestion} />
        </div>
        <span className="text-neutral-500 truncate min-w-0">{taskTarget}</span>
      </button>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="mt-2 pl-5 border-l border-neutral-200 ml-1.5">
          {/* 工具列表 */}
          {tools && tools.length > 0 && (
            <div className="flex items-center gap-1 mb-2 text-xs text-neutral-400">
              <span>工具:</span>
              {tools.map((tool) => (
                <span key={`${taskId}-${tool}`} className="px-1.5 py-0.5 bg-neutral-100 rounded">
                  {tool}
                </span>
              ))}
            </div>
          )}

          {/* 消息列表 */}
          <div className="space-y-2">
            {displayMessages.length > 0 ? (
              <NestingProvider level={nestingLevel + 1} taskId={taskId}>
                {displayMessages.map((msg) => {
                  const element = renderDisplayMessage(msg);
                  if (!element) return null;
                  return <div key={`${taskId}-msg-${msg.updateTime}-${Math.random()}`}>{element}</div>;
                })}
              </NestingProvider>
            ) : (
              <div className="text-xs text-neutral-400 py-2">加载中...</div>
            )}
            {isLoading && (
              <div className="flex items-center gap-2 py-2">
                <span className="loading loading-dots loading-xs text-neutral-500"></span>
                <span className="text-xs text-neutral-500">正在思考中...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const SubTaskRenderer: React.FC<SubTaskRendererProps> = (props) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return <SubTaskContent {...props} isExpanded={isExpanded} setIsExpanded={setIsExpanded} />;
};

export default SubTaskRenderer;

import { ChevronDown, ChevronRight, CheckCircle, AlertCircle, Loader } from "lucide-react";
import { useEffect, useState } from "react";
import { NestingProvider, useNesting } from "./NestingContext";
import { renderDisplayMessage } from "./renderers";
import { useWebSocket, WebSocketProvider } from "./WebSocketProvider";

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
  const { displayMessages, sendMessage, isLoading } = useWebSocket();
  const { nestingLevel } = useNesting();

  useEffect(() => {
    if (isExpanded) {
      sendMessage({ type: "loadTask", data: { taskId } });
    }
  }, [isExpanded, taskId, sendMessage]);

  const hasFollowupQuestion = displayMessages.some((msg) => msg.type === "askFollowupQuestion");
  const hasError = displayMessages.some((msg) => msg.type === "error");

  return (
    <div className="py-1">
      {/* 任务标题行 */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm w-full text-left hover:bg-neutral-50 rounded px-1 -mx-1 cursor-pointer"
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
        )}
        <span className="font-medium text-neutral-700">#{taskIndex + 1}</span>
        <StatusIcon hasError={hasError} isCompleted={isCompleted} hasFollowupQuestion={hasFollowupQuestion} />
        <span className="text-neutral-500 truncate">{taskTarget}</span>
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
              <NestingProvider level={nestingLevel + 1}>
                {displayMessages.map((msg) => {
                  const element = renderDisplayMessage(msg);
                  if (!element) return null;
                  return <div key={`${taskId}-msg-${msg.updateTime}`}>{element}</div>;
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

  return (
    <WebSocketProvider>
      <SubTaskContent {...props} isExpanded={isExpanded} setIsExpanded={setIsExpanded} />
    </WebSocketProvider>
  );
};

export default SubTaskRenderer;

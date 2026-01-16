import { AlertCircle, CheckCircle, ChevronDown, ChevronRight, Loader } from "lucide-react";
import { type FC, useCallback, useEffect, useState } from "react";
import { useWebSocketContext } from "../context/WebSocketContext";
import { useMessages } from "../hooks/useMessages";
import { useTasks } from "../hooks/useTasks";
import type { DisplayMessageType } from "../messages/types";
import { defaultRenderers } from "./renderers";

/**
 * Props for the TaskRenderer component
 */
export interface TaskRendererProps {
  /** Task ID to render */
  taskId: string;
  /** Whether to show child tasks */
  showChildren?: boolean;
  /** Current nesting depth (for styling) */
  depth?: number;
  /** Additional CSS class name */
  className?: string;
}

/**
 * Props for status icon
 */
interface StatusIconProps {
  hasError: boolean;
  isCompleted: boolean;
  hasFollowupQuestion: boolean;
  isLoading: boolean;
}

/**
 * Status icon component
 */
const StatusIcon: FC<StatusIconProps> = ({
  hasError,
  isCompleted,
  hasFollowupQuestion,
  isLoading,
}) => {
  if (hasError) return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
  if (isCompleted) return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
  if (hasFollowupQuestion) return <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />;
  if (isLoading) return <Loader className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
  return <div className="w-3.5 h-3.5 rounded-full bg-gray-300" />;
};

/**
 * TaskRenderer component that displays a task and its hierarchy
 *
 * Uses the SDK's useTasks and useMessages hooks to display task information
 * and can recursively render child tasks.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <TaskRenderer taskId="task-123" />
 *
 * // With children
 * <TaskRenderer taskId="task-123" showChildren={true} />
 *
 * // With custom depth
 * <TaskRenderer taskId="task-123" depth={2} />
 * ```
 */
export const TaskRenderer: FC<TaskRendererProps> = ({
  taskId,
  showChildren = false,
  depth = 0,
  className = "",
}) => {
  const { tasks, getTaskHierarchy, getTaskStatus } = useTasks();
  const { messages } = useMessages(taskId);
  const context = useWebSocketContext();
  const [isExpanded, setIsExpanded] = useState(false);

  // Get task information
  const task = tasks[taskId];
  const taskStatus = getTaskStatus(taskId);
  const taskHierarchy = getTaskHierarchy(taskId);
  const hasChildren = taskHierarchy.children.length > 0;

  // Analyze task state
  const isLoading = task?.isLoading || false;
  const isCompleted = taskStatus === "completed";
  const hasError = taskStatus === "error";

  // Check for followup questions in messages
  const hasFollowupQuestion = messages.some(
    (msg) => msg.type === "askFollowupQuestion" && !(msg as any).disabled,
  );

  // Auto-expand if there are followup questions
  useEffect(() => {
    if (hasFollowupQuestion && !isExpanded) {
      setIsExpanded(true);
    }
  }, [hasFollowupQuestion, isExpanded]);

  /**
   * Render a single message using the appropriate renderer
   */
  const renderMessage = useCallback(
    (message: DisplayMessageType, index: number) => {
      const isLatest = index === messages.length - 1;

      // Get custom renderer from context
      const customRenderer = context.renderers?.[message.type];

      if (customRenderer) {
        return (
          <div key={`${message.type}-${message.updateTime}-${index}`}>
            {(customRenderer as any)({ message, isLatest })}
          </div>
        );
      }

      // Fall back to default renderer
      const defaultRenderer = (defaultRenderers as any)[message.type];
      if (defaultRenderer) {
        return (
          <div key={`${message.type}-${message.updateTime}-${index}`}>
            {defaultRenderer({ message, isLatest })}
          </div>
        );
      }

      // Fallback for unknown message types
      return (
        <div key={`unknown-${message.updateTime}-${index}`} className="text-red-500 text-sm">
          Unknown message type: {message.type}
        </div>
      );
    },
    [messages, taskId, context.renderers],
  );

  // Get task title from first message or use task ID
  const getTaskTitle = () => {
    if (messages.length > 0) {
      const firstMessage = messages[0];
      if (firstMessage.type === "userSendMessage") {
        return (firstMessage as any).message || `Task ${taskId}`;
      }
    }
    return `Task ${taskId}`;
  };

  const taskTitle = getTaskTitle();
  const indentLevel = Math.min(depth, 5); // Limit nesting depth for UI

  return (
    <div className={`task-renderer ${className}`} style={{ marginLeft: `${indentLevel * 16}px` }}>
      {/* Task header */}
      <div className="py-1">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm w-full text-left hover:bg-gray-50 rounded px-2 py-1 transition-colors"
          disabled={!task}
        >
          {/* Expand/collapse icon */}
          {hasChildren || messages.length > 0 ? (
            isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            )
          ) : (
            <div className="w-3.5 h-3.5 shrink-0" />
          )}

          {/* Status icon */}
          <div className="shrink-0">
            <StatusIcon
              hasError={hasError}
              isCompleted={isCompleted}
              hasFollowupQuestion={hasFollowupQuestion}
              isLoading={isLoading}
            />
          </div>

          {/* Task title */}
          <span className="text-gray-700 truncate min-w-0 font-medium">{taskTitle}</span>

          {/* Task ID (for debugging) */}
          <span className="text-xs text-gray-400 shrink-0">{taskId.slice(-8)}</span>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-2 pl-6 border-l border-gray-200 ml-2">
            {/* Messages */}
            {messages.length > 0 && (
              <div className="space-y-2 mb-4">
                {messages.map((message, index) => renderMessage(message, index))}
              </div>
            )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                <Loader className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </div>
            )}

            {/* Child tasks */}
            {showChildren && hasChildren && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-500 mb-2">Subtasks:</div>
                {taskHierarchy.children.map((childTask) => (
                  <TaskRenderer
                    key={childTask.taskId}
                    taskId={childTask.taskId}
                    showChildren={showChildren}
                    depth={depth + 1}
                  />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!isLoading && messages.length === 0 && (!showChildren || !hasChildren) && (
              <div className="text-xs text-gray-400 py-2">No messages yet</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskRenderer;

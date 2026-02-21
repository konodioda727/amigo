import { Loader2, Trash2 } from "lucide-react";
import type { FC } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWebSocketContext } from "../context/WebSocketContext";
import { useSendMessage } from "../hooks/useSendMessage";
import { useTasks } from "../hooks/useTasks";

/**
 * Props for the ConversationHistory component
 */
export interface ConversationHistoryProps {
  /** Additional CSS class name */
  className?: string;
  /** Callback when a conversation is selected */
  onSelectConversation?: (taskId: string) => void;
  /** Current active task ID (for highlighting) */
  activeTaskId?: string;
}

/**
 * ConversationHistory component that displays a list of past conversations
 *
 * Uses the SDK's useTasks hook to display conversation history and allows
 * users to switch between different conversations.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <ConversationHistory />
 *
 * // With custom callback
 * <ConversationHistory
 *   onSelectConversation={(taskId) => console.log('Selected:', taskId)}
 * />
 *
 * // With active task highlighting
 * <ConversationHistory activeTaskId="task-123" />
 *
 * // With custom styling
 * <ConversationHistory className="my-custom-class" />
 * ```
 */
export const ConversationHistory: FC<ConversationHistoryProps> = ({
  className = "",
  onSelectConversation,
  activeTaskId,
}) => {
  const { mainTaskId } = useTasks();
  const context = useWebSocketContext();
  const { store } = context;
  const { sendDeleteTask } = useSendMessage();
  const navigate = useNavigate();
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  // Get task histories from store
  const taskHistories = store((state) => state.taskHistories);

  // Listen for taskDeleted message to clear loading state
  useState(() => {
    const unsubscribe = store.subscribe((state) => {
      // Check if the deleting task is no longer in the list
      if (deletingTaskId && !state.taskHistories.find((h) => h.taskId === deletingTaskId)) {
        setDeletingTaskId(null);
      }
    });
    return () => unsubscribe();
  });

  // Use activeTaskId if provided, otherwise fall back to mainTaskId
  const currentTaskId = activeTaskId ?? mainTaskId;

  /**
   * Format time display for conversation timestamps
   */
  const formatTime = (dateStr: string | undefined) => {
    if (!dateStr) return "";

    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "";

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    }
    if (diffDays === 1) {
      return "Yesterday";
    }
    if (diffDays < 7) {
      return `${diffDays} days ago`;
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  /**
   * Handle conversation selection
   */
  const handleHistoryClick = (taskId: string) => {
    // Update main task ID in store
    store.getState().setMainTaskId(taskId);

    // Call custom callback if provided
    onSelectConversation?.(taskId);
  };

  /**
   * Handle delete conversation
   */
  const handleDelete = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the conversation selection

    if (window.confirm("Are you sure you want to delete this conversation?")) {
      // Set loading state
      setDeletingTaskId(taskId);

      // If deleting the current task, navigate to home first
      const currentTaskId = activeTaskId ?? mainTaskId;
      if (currentTaskId === taskId) {
        navigate("/");
      }

      sendDeleteTask(taskId);
    }
  };

  // Don't render if no conversations
  if (!taskHistories || taskHistories.length === 0) {
    return (
      <div className={`flex items-center justify-center p-8 text-gray-500 ${className}`}>
        <div className="text-center">
          <p className="text-sm mb-2">No conversations yet</p>
          <p className="text-xs">Start a new conversation to see it here</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`conversation-history ${className}`}>
      <ul className="space-y-1">
        {taskHistories.map((history) => {
          const isActive = history.taskId === currentTaskId;

          return (
            <li key={history.taskId} className="mb-3">
              <div
                className={`
                  relative group
                  w-full
                  rounded-xl
                  transition-all duration-150
                  border
                  ${
                    isActive
                      ? "bg-blue-50 border-blue-200 shadow-sm"
                      : "bg-white border-transparent hover:bg-gray-50"
                  }
                  ${deletingTaskId === history.taskId ? "opacity-50" : ""}
                `}
              >
                <button
                  type="button"
                  className={`
                    w-full text-left
                    px-4 py-3
                    rounded-xl
                    text-sm
                    transition-all duration-150
                    ${isActive ? "text-blue-700" : "text-gray-700 hover:text-gray-900"}
                  `}
                  onClick={() => handleHistoryClick(history.taskId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleHistoryClick(history.taskId);
                    }
                  }}
                  aria-label={`Select conversation: ${history.title}`}
                  disabled={deletingTaskId === history.taskId}
                >
                  <div className="flex items-center justify-between gap-2 pr-8">
                    <span className="truncate flex-1" title={history.title}>
                      {history.title}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {formatTime(history.updatedAt)}
                    </span>
                  </div>
                </button>

                {/* Delete button - shows on hover or when deleting */}
                <button
                  type="button"
                  className={`
                    absolute right-2 top-1/2 -translate-y-1/2
                    p-2
                    rounded-lg
                    text-gray-400 hover:text-red-600 hover:bg-red-50
                    transition-all duration-150
                    ${
                      deletingTaskId === history.taskId
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    }
                  `}
                  onClick={(e) => handleDelete(history.taskId, e)}
                  aria-label={`Delete conversation: ${history.title}`}
                  title="Delete conversation"
                  disabled={deletingTaskId === history.taskId}
                >
                  {deletingTaskId === history.taskId ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ConversationHistory;

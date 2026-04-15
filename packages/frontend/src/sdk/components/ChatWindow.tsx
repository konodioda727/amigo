import { ArrowDown } from "lucide-react";
import React, { type FC, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { AmigoLogo } from "../../components/AmigoLogo";
import { useWebSocketContext } from "../context/WebSocketContext";
import { useMessages } from "../hooks/useMessages";
import { useTasks } from "../hooks/useTasks";
import type { DisplayMessageType } from "../messages/types";
import { defaultRenderers } from "./renderers";
import type { TaskTimelineNode } from "./taskTimeline";
import { buildTaskTimeline } from "./taskTimeline";

const AssistantAvatar: FC<{ className?: string; isAnimating?: boolean }> = ({
  className = "",
  isAnimating = false,
}) => (
  <AmigoLogo
    className={[isAnimating ? "animate-pulse" : "", className].filter(Boolean).join(" ")}
    isAnimating={isAnimating}
    aria-hidden="true"
  />
);

const TypingIndicator = React.memo(() => (
  <div className="px-6 pt-2 pb-6 flex items-center gap-2">
    <AssistantAvatar className="h-7 w-8 opacity-75" isAnimating={true} />
    <span className="text-xs font-medium text-neutral-300 tracking-wide">正在思考与执行...</span>
  </div>
));

interface VirtuosoFooterContext {
  shouldShowTyping: boolean;
}

const ChatFooter: FC<{ context?: VirtuosoFooterContext }> = ({ context }) => {
  if (!context?.shouldShowTyping) return null;
  return <TypingIndicator />;
};

const virtuosoComponents = {
  Footer: ChatFooter,
};

const AT_BOTTOM_THRESHOLD_PX = 24;

/**
 * Props for the ChatWindow component
 */
export interface ChatWindowProps {
  /** Optional task ID. If not provided, uses the current task */
  taskId?: string;
  /** Additional CSS class name */
  className?: string;
  /** Whether to show the header */
  showHeader?: boolean;
  /** Custom header content */
  headerContent?: React.ReactNode;
}

/**
 * ChatWindow component that displays messages for a task
 *
 * Uses the SDK's useMessages and useRenderer hooks to display messages
 * with appropriate renderers (custom or default).
 *
 * @example
 * ```tsx
 * // Basic usage
 * <ChatWindow />
 *
 * // With specific task
 * <ChatWindow taskId="task-123" />
 *
 * // With custom header
 * <ChatWindow
 *   showHeader={true}
 *   headerContent={<h2>Chat with AI</h2>}
 * />
 * ```
 */
export const ChatWindow: FC<ChatWindowProps> = ({
  taskId,
  className = "",
  showHeader = false,
  headerContent,
}) => {
  const { messages } = useMessages(taskId);
  const context = useWebSocketContext();
  const { store } = context;
  const { getTaskStatus } = useTasks();

  const activeTaskId = store((state) => state.activeTaskId);
  const mainTaskId = store((state) => state.mainTaskId);
  const isCreatingConversation = store((state) => state.isCreatingConversation);
  const effectiveTaskId = taskId ?? activeTaskId ?? mainTaskId;
  const status = effectiveTaskId ? getTaskStatus(effectiveTaskId) : "idle";
  const shouldShowInitialLoading = isCreatingConversation || status === "streaming";
  const timelineNodes = useMemo(
    () =>
      buildTaskTimeline({
        messages,
        taskStatus: status,
      }),
    [messages, status],
  );

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [isAtBottom, setIsAtBottom] = useState(false);

  // Scroll to bottom
  const scrollToBottom = (behavior: "auto" | "smooth" = "smooth") => {
    if (messages.length === 0) return;

    // Prefer scrolling to the absolute bottom so the Footer typing indicator is visible too.
    (virtuosoRef.current as any)?.scrollTo?.({
      top: Number.MAX_SAFE_INTEGER,
      behavior,
    });

    virtuosoRef.current?.scrollToIndex({
      index: messages.length - 1,
      align: "end",
      behavior,
    });
  };

  const getTimelineNodeKey = (node: TaskTimelineNode, index: number) => {
    const { message } = node;
    if (message.type === "tool") {
      return `tool-${message.toolCallId || message.toolName}-${message.updateTime}-${index}`;
    }

    return `${message.type}-${message.updateTime}-${index}`;
  };

  const lastMessage = messages[messages.length - 1];
  /**
   * Render a single message using the appropriate renderer
   */
  const renderMessage = (message: DisplayMessageType, index: number, totalCount: number) => {
    const isLatest = index === totalCount - 1;

    // Get custom renderer from context
    const customRenderer = context.renderers?.[message.type];

    if (customRenderer) {
      return <div>{(customRenderer as any)({ message, isLatest })}</div>;
    }

    // Fall back to default renderer
    const defaultRenderer = (defaultRenderers as any)[message.type];
    if (defaultRenderer) {
      return <div>{defaultRenderer({ message, isLatest })}</div>;
    }

    // Fallback for unknown message types
    return <div className="text-red-500">Unknown message type: {message.type}</div>;
  };

  const renderTimelineNode = (node: TaskTimelineNode, index: number) =>
    renderMessage(node.message, index, timelineNodes.length);

  const isPendingUserMessage =
    lastMessage?.type === "userSendMessage" && lastMessage.status === "pending";
  const shouldShowTyping = status === "streaming" && !isPendingUserMessage;

  return (
    <div className={`flex-1 w-full flex flex-col overflow-hidden relative ${className}`}>
      {/* Optional header */}
      {showHeader && (
        <div className="flex-shrink-0 border-b border-neutral-200 p-4">
          {headerContent || <div className="text-lg font-semibold">Chat</div>}
        </div>
      )}

      {/* Messages container */}
      <div className="flex-1 w-full flex justify-center overflow-hidden">
        {messages.length === 0 ? (
          shouldShowInitialLoading ? (
            <div className="w-full max-w-[1200px] h-full overflow-y-auto">
              <div className="px-6 pt-6">
                <TypingIndicator />
              </div>
            </div>
          ) : (
            <div className="w-full max-w-[1200px] flex items-center justify-center h-full text-neutral-500 p-6">
              <div className="text-center flex flex-col items-center">
                <AssistantAvatar className="mb-4 h-20 w-20 opacity-80" isAnimating={false} />
                <p className="text-lg font-medium text-neutral-600 mb-1">今天想做点什么？</p>
                <p className="text-sm text-neutral-400">在下方输入您的需求，我将为您完成任务</p>
              </div>
            </div>
          )
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            className="w-full max-w-[1200px]"
            style={{ height: "100%", overflowAnchor: "none" }}
            data={timelineNodes}
            defaultItemHeight={120}
            increaseViewportBy={{ top: 600, bottom: 1000 }}
            atBottomThreshold={AT_BOTTOM_THRESHOLD_PX}
            computeItemKey={(index, node) => getTimelineNodeKey(node, index)}
            followOutput={(atBottom) => (atBottom ? "smooth" : false)}
            atBottomStateChange={setIsAtBottom}
            context={{ shouldShowTyping }}
            components={virtuosoComponents}
            itemContent={(index, node) => {
              const isFirst = index === 0;
              const isLast = index === timelineNodes.length - 1;

              return (
                <div
                  className={["px-6", isFirst ? "pt-6" : "pt-2", isLast ? "pb-6" : "pb-2"].join(
                    " ",
                  )}
                >
                  {renderTimelineNode(node, index)}
                </div>
              );
            }}
          />
        )}
      </div>

      {/* Scroll to bottom button */}
      {messages.length > 0 && !isAtBottom && (
        <button
          type="button"
          onClick={() => {
            scrollToBottom("smooth");
          }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-md hover:shadow-lg transition-all border-0"
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="w-5 h-5 text-neutral-700" />
        </button>
      )}
    </div>
  );
};

export default ChatWindow;

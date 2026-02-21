import { ArrowDown } from "lucide-react";
import { type FC, useEffect, useRef, useState } from "react";
import { useWebSocketContext } from "../context/WebSocketContext";
import { useMessages } from "../hooks/useMessages";
import type { DisplayMessageType } from "../messages/types";
import { defaultRenderers } from "./renderers";

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
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const shouldAutoScrollRef = useRef(true);

  // Check if scrolled to bottom
  const isAtBottom = () => {
    if (!messageContainerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = messageContainerRef.current;
    return scrollHeight - scrollTop - clientHeight < 100;
  };

  // Scroll to bottom
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTo({
        top: messageContainerRef.current.scrollHeight,
        behavior,
      });
    }
  };

  // Handle scroll events
  const handleScroll = () => {
    const atBottom = isAtBottom();
    setShowScrollButton(!atBottom);
    shouldAutoScrollRef.current = atBottom;

    if (atBottom) {
      setIsUserScrolling(false);
    }
  };

  // Listen for user scrolling
  useEffect(() => {
    const container = messageContainerRef.current;
    if (!container) return;

    let scrollTimeout: number;
    const onScroll = () => {
      setIsUserScrolling(true);
      clearTimeout(scrollTimeout);
      scrollTimeout = window.setTimeout(() => {
        handleScroll();
      }, 150);
    };

    container.addEventListener("scroll", onScroll);
    return () => {
      container.removeEventListener("scroll", onScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  // Auto-scroll when messages update (if user hasn't manually scrolled)
  useEffect(() => {
    if (!isUserScrolling && shouldAutoScrollRef.current) {
      scrollToBottom("smooth");
    }
  }, [messages, isUserScrolling]);

  // Reset scroll state when task changes
  const prevTaskIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (taskId !== prevTaskIdRef.current) {
      prevTaskIdRef.current = taskId;
      setIsUserScrolling(false);
      setShowScrollButton(false);
      shouldAutoScrollRef.current = true;
      setTimeout(() => scrollToBottom("auto"), 100);
    }
  }, [taskId]);

  /**
   * Render a single message using the appropriate renderer
   */
  const renderMessage = (message: DisplayMessageType, index: number) => {
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
      <div key={`unknown-${message.updateTime}-${index}`} className="text-red-500">
        Unknown message type: {message.type}
      </div>
    );
  };

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
        <div
          ref={messageContainerRef}
          className="w-full max-w-[1200px] overflow-y-auto scroll-smooth space-y-4 p-6"
        >
          {messages.map((message, index) => renderMessage(message, index))}

          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-neutral-500">
              <div className="text-center">
                <p className="text-lg mb-2">No messages yet</p>
                <p className="text-sm">Start a conversation to see messages here</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && messages.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setIsUserScrolling(false);
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

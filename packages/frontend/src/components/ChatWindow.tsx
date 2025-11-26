import { type FC, useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { renderDisplayMessage } from "./renderers";
import { useWebSocket } from "./WebSocketProvider";

const ChatWindow: FC = () => {
  const { displayMessages, isLoading, taskId } = useWebSocket();
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const shouldAutoScrollRef = useRef(true); // 是否应该自动滚动

  // 检查是否在底部
  const isAtBottom = () => {
    if (!messageContainerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = messageContainerRef.current;
    return scrollHeight - scrollTop - clientHeight < 100;
  };

  // 滚动到底部
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTo({
        top: messageContainerRef.current.scrollHeight,
        behavior,
      });
    }
  };

  // 处理滚动事件
  const handleScroll = () => {
    const atBottom = isAtBottom();
    setShowScrollButton(!atBottom);
    shouldAutoScrollRef.current = atBottom;
    
    if (atBottom) {
      setIsUserScrolling(false);
    }
  };

  // 监听用户滚动
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

  // 切换会话时滚动到底部
  const prevTaskIdRef = useRef<string>("");
  useEffect(() => {
    if (taskId !== prevTaskIdRef.current) {
      prevTaskIdRef.current = taskId;
      setIsUserScrolling(false);
      setShowScrollButton(false);
      shouldAutoScrollRef.current = true;
      setTimeout(() => scrollToBottom("auto"), 100);
    }
  }, [taskId, displayMessages]);

  // 正常消息更新时自动滚动
  useEffect(() => {
    if (!isUserScrolling && shouldAutoScrollRef.current) {
      scrollToBottom("smooth");
    }
  }, [displayMessages, isLoading, isUserScrolling]);

  return (
    <div className="flex-1 w-full flex justify-center overflow-hidden relative">
      <div
        ref={messageContainerRef}
        className="w-full max-w-[1200px] overflow-y-auto scroll-smooth space-y-4 p-6"
      >
        {displayMessages.map((msg) => renderDisplayMessage(msg))}
        {isLoading && (
          <div className="chat chat-start">
            <div className="chat-bubble bg-neutral-100 text-neutral-900 rounded-xl px-4 py-3 shadow-none">
              <div className="flex items-center gap-2">
                <span className="loading loading-dots loading-sm text-neutral-600"></span>
                <span className="text-sm text-neutral-600">正在思考中...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 回到底部按钮 */}
      {showScrollButton && displayMessages.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setIsUserScrolling(false);
            scrollToBottom("smooth");
          }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-md hover:shadow-lg transition-all border-0"
          aria-label="回到底部"
        >
          <ArrowDown className="w-5 h-5 text-neutral-700" />
        </button>
      )}
    </div>
  );
};

export default ChatWindow;

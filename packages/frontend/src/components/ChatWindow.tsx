import { type FC, useEffect, useRef } from "react";
import { renderDisplayMessage } from "./renderers";
import { useWebSocket } from "./WebSocketProvider";

const ChatWindow: FC = () => {
  const { displayMessages, isLoading } = useWebSocket();

  const messageContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTo({
        top: messageContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [displayMessages, isLoading]);
  
  return (
    <div className="flex-1 w-full flex justify-center overflow-hidden">
      <div
        ref={messageContainerRef}
        className="w-full max-w-[1200px] overflow-y-auto scroll-smooth space-y-4 p-6"
      >
      {displayMessages.map((msg) => 
        renderDisplayMessage(msg))}
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
    </div>
  );
};

export default ChatWindow;

import React, { useRef, useEffect } from "react";
import { useWebSocket } from "./WebSocketProvider";
import { renderDisplayMessage } from "./renderers";

const ChatWindow: React.FC = () => {
  const { displayMessages, isLoading } = useWebSocket();

  const messageContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
    }
  }, [displayMessages, isLoading]);
  
  return (
    <div
      ref={messageContainerRef}
      className="bg-base-100 p-4 rounded-box h-80 overflow-y-auto mb-4 shadow-inner"
    >
      {displayMessages.map((msg) => 
        renderDisplayMessage(msg))}
      {isLoading && (
        <div className="chat chat-start mb-4">
          <div className="chat-bubble bg-base-200 text-base-content">
            <div className="flex items-center gap-2">
              <span className="loading loading-dots loading-sm"></span>
              <span className="text-sm opacity-70">正在思考中...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatWindow;

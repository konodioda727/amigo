import React, { useRef, useEffect } from "react";
import { useWebSocket } from "./WebSocketProvider";
import { renderDisplayMessage } from "./renderers";

const ChatWindow: React.FC = () => {
  const { displayMessages } = useWebSocket();

  const messageContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
    }
  }, [displayMessages]);

  return (
    <div
      ref={messageContainerRef}
      className="bg-base-100 p-4 rounded-box h-80 overflow-y-auto mb-4 shadow-inner"
    >
      {displayMessages.map((msg) => renderDisplayMessage(msg))}
    </div>
  );
};

export default ChatWindow;

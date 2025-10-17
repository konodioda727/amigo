import { WebSocketMessage } from "@amigo/types";
import React from "react";

const ConnectedRenderer: React.FC<WebSocketMessage<'connected'>> = (msg) => {
  return (
    <div className="divider text-center mb-2 opacity-70">
      <div className="text-xs opacity-50">
        {msg.data.updateTime && new Date(msg.data.updateTime).toLocaleTimeString()}
      </div>
      <div>系统消息: {msg.data.message}</div>
    </div>
  );
};

export default ConnectedRenderer
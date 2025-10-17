import React from "react";
import {
  WebSocketProvider,
} from "./components/WebSocketProvider";
import ChatWindow from "./components/ChatWindow";
import MessageInput from "./components/MessageInput";
import ConversationHistory from "./components/ConversationHistory";

const App: React.FC = () => {

  return (
    <WebSocketProvider>
      <div className="container mx-auto p-4 max-w-3xl">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
          Amigo WebSocket 测试
        </h1>

        <ChatWindow />

        <ConversationHistory />

        <MessageInput/>
      </div>
    </WebSocketProvider>
  );
};

export default App;

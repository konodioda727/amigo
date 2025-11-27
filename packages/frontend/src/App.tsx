import type React from "react";
import { useEffect } from "react";
import { Toaster } from "react-hot-toast";
import ChatWindow from "./components/ChatWindow/ChatWindow";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import MessageInput from "./components/MessageInput";
import { useWebSocketStore } from "./store/websocket";

const App: React.FC = () => {
  // 初始化全局 WebSocket 连接
  const connect = useWebSocketStore((state) => state.connect);
  const disconnect = useWebSocketStore((state) => state.disconnect);
  
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return (
    <ErrorBoundary>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            maxWidth: "400px",
            wordBreak: "break-word",
          },
        }}
      />
      <Layout>
        <ChatWindow />
        <MessageInput />
      </Layout>
    </ErrorBoundary>
  );
};

export default App;

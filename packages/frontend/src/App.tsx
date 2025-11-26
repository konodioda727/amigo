import type React from "react";
import { Toaster } from "react-hot-toast";
import ChatWindow from "./components/ChatWindow";
import Layout from "./components/Layout";
import MessageInput from "./components/MessageInput";
import { WebSocketProvider } from "./components/WebSocketProvider";

const App: React.FC = () => {
  return (
    <WebSocketProvider>
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
    </WebSocketProvider>
  );
};

export default App;

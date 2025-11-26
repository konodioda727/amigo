import type React from "react";
import { Toaster } from "react-hot-toast";
import { WebSocketProvider } from "./components/WebSocketProvider";
import ChatWindow from "./components/ChatWindow";
import MessageInput from "./components/MessageInput";
import Sidebar from "./components/Sidebar";
import MainContent from "./components/MainContent";

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
      <Sidebar />
      <MainContent>
        <ChatWindow />
        <MessageInput />
      </MainContent>
    </WebSocketProvider>
  );
};

export default App;

import type React from "react";
import { Toaster } from "react-hot-toast";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import { ChatWindow, MessageInput, WebSocketProvider } from "./sdk";
import { isLocalhost } from "./utils/isLocalhost";

const App: React.FC = () => {
  // Determine WebSocket URL based on environment
  const wsUrl = `${isLocalhost() ? "ws" : "wss"}://${window.location.hostname}:10013`;

  return (
    <ErrorBoundary>
      <WebSocketProvider
        url={wsUrl}
        autoConnect={true}
        reconnect={true}
        onConnect={() => console.log("[App] WebSocket connected")}
        onDisconnect={() => console.log("[App] WebSocket disconnected")}
        onError={(error) => console.error("[App] WebSocket error:", error)}
      >
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
    </ErrorBoundary>
  );
};

export default App;

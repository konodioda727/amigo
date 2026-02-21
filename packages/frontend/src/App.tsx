import type React from "react";
import { Toaster } from "react-hot-toast";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import ChatPage from "./pages/ChatPage";
import HomePage from "./pages/HomePage";
import { WebSocketProvider } from "./sdk";
import { isLocalhost } from "./utils/isLocalhost";

const App: React.FC = () => {
  // Determine WebSocket URL based on environment
  const wsUrl = `${isLocalhost() ? "ws" : "wss"}://${window.location.hostname}:10013`;

  return (
    <ErrorBoundary>
      <BrowserRouter>
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
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/:taskId" element={<ChatPage />} />
            </Routes>
          </Layout>
        </WebSocketProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;

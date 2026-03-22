import { WebSocketProvider } from "@amigo-llm/frontend";
import type React from "react";
import { Toaster } from "react-hot-toast";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import { SandboxToolRenderer } from "./components/SandboxToolRenderer";
import AdminPage from "./pages/AdminPage";
import ChatPage from "./pages/ChatPage";
import DesignPage from "./pages/DesignPage";
import HomePage from "./pages/HomePage";
import SkillsPage from "./pages/SkillsPage";
import { isLocalhost } from "./utils/isLocalhost";

type RuntimeConfigWindow = Window &
  typeof globalThis & {
    __AMIGO_CONFIG__?: {
      wsUrl?: string;
    };
  };

const resolveWebSocketUrl = (): string => {
  const configuredUrl = ((window as RuntimeConfigWindow).__AMIGO_CONFIG__?.wsUrl || "").trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  if (isLocalhost()) {
    return `ws://${window.location.hostname}:10013/ws`;
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws`;
};

const App: React.FC = () => {
  const wsUrl = resolveWebSocketUrl();

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <WebSocketProvider
          url={wsUrl}
          autoConnect={true}
          reconnect={true}
          renderers={{
            tool: (props) => <SandboxToolRenderer {...props} />,
          }}
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
              <Route path="/admin" element={<Navigate to="/automations" replace />} />
              <Route path="/automations" element={<AdminPage />} />
              <Route path="/skills" element={<SkillsPage />} />
              <Route path="/:taskId/design" element={<DesignPage />} />
              <Route path="/:taskId/design/:pageId" element={<DesignPage />} />
              <Route path="/:taskId" element={<ChatPage />} />
            </Routes>
          </Layout>
        </WebSocketProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;

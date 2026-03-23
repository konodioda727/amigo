import { WebSocketProvider } from "@amigo-llm/frontend";
import type React from "react";
import { Toaster } from "react-hot-toast";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { authClient } from "./auth/client";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import { SandboxToolRenderer } from "./components/SandboxToolRenderer";
import AdminPage from "./pages/AdminPage";
import AuthPage from "./pages/AuthPage";
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

const ProtectedApp: React.FC<{ wsUrl: string }> = ({ wsUrl }) => (
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
);

const ProtectedRoutes: React.FC<{ wsUrl: string }> = ({ wsUrl }) => {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500">
        正在验证登录状态...
      </div>
    );
  }

  if (!session?.user) {
    return <Navigate to="/login" replace />;
  }

  return <ProtectedApp wsUrl={wsUrl} />;
};

const App: React.FC = () => {
  const wsUrl = resolveWebSocketUrl();

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="*" element={<ProtectedRoutes wsUrl={wsUrl} />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;

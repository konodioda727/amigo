import { ChevronLeft, SquareArrowOutUpRight } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useConnection } from "@/sdk";
import { useWebSocketContext } from "@/sdk/context/WebSocketContext";

const getHttpBaseUrlFromWebSocketUrl = (wsUrl: string): string => {
  const parsed = new URL(wsUrl);
  parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
};

interface DesignDocListItem {
  pageId: string;
}

interface PenpotBindingResponse {
  penpotBaseUrl: string;
  activeUrl: string;
}

const DesignPage: React.FC = () => {
  const { taskId, pageId } = useParams<{ taskId: string; pageId?: string }>();
  const navigate = useNavigate();
  const { config, store } = useWebSocketContext();
  const { isConnected } = useConnection();
  const httpBaseUrl = useMemo(() => getHttpBaseUrlFromWebSocketUrl(config.url), [config.url]);

  const [docsLoading, setDocsLoading] = useState(true);
  const [activeUrl, setActiveUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (taskId && isConnected) {
      store.getState().setMainTaskId(taskId);
    }
  }, [taskId, isConnected, store]);

  useEffect(() => {
    if (!taskId) return;

    const loadDocs = async () => {
      setDocsLoading(true);
      setError("");

      try {
        const response = await fetch(
          `${httpBaseUrl}/api/tasks/${encodeURIComponent(taskId)}/design-docs`,
        );
        const data = await response.json();
        const items = Array.isArray(data.items) ? (data.items as DesignDocListItem[]) : [];

        if (!pageId && items.length > 0) {
          navigate(`/${taskId}/design/${items[0].pageId}`, { replace: true });
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        setDocsLoading(false);
      }
    };

    void loadDocs();
  }, [taskId, pageId, httpBaseUrl, navigate]);

  useEffect(() => {
    if (!taskId || !pageId) return;

    const loadDetail = async () => {
      setError("");

      try {
        const bindingRes = await fetch(
          `${httpBaseUrl}/api/tasks/${encodeURIComponent(taskId)}/penpot/${encodeURIComponent(pageId)}`,
        );
        const bindingData = (await bindingRes.json()) as PenpotBindingResponse;

        setActiveUrl(bindingData.activeUrl || bindingData.penpotBaseUrl || "");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    };

    void loadDetail();
  }, [taskId, pageId, httpBaseUrl]);

  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden bg-[#0d1015]">
      <header className="relative z-20 flex h-10 shrink-0 items-center justify-between border-b border-black/5 bg-white/74 px-3 backdrop-blur-sm md:px-4">
        <Link
          to={taskId ? `/${taskId}` : "/"}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium text-neutral-700 transition-colors hover:bg-black/5 hover:text-neutral-950"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          返回
        </Link>

        <div className="flex items-center gap-2">
          {activeUrl && (
            <a
              href={activeUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium text-neutral-700 transition-colors hover:bg-black/5 hover:text-neutral-950"
            >
              <SquareArrowOutUpRight className="h-3.5 w-3.5" />
              新窗口打开
            </a>
          )}
        </div>
      </header>

      <section className="relative flex-1 min-h-0 w-full">
        {error && (
          <div className="absolute left-3 top-3 z-10 rounded-full bg-rose-500/90 px-3 py-1 text-xs text-white shadow-lg">
            {error}
          </div>
        )}
        {pageId ? (
          <iframe
            key={activeUrl}
            src={activeUrl}
            title={`Penpot ${pageId}`}
            className="h-full w-full border-0 bg-[#0d1015]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/50">
            {docsLoading ? "正在加载设计稿…" : "当前任务还没有设计稿"}
          </div>
        )}
      </section>
    </div>
  );
};

export default DesignPage;

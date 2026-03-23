import { useConnection, useWebSocketContext } from "@amigo-llm/frontend";
import { ChevronLeft, RefreshCw, SquareArrowOutUpRight } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getHttpBaseUrlFromWebSocketUrl } from "@/utils/sandboxEditor";
import { toast } from "@/utils/toast";

interface DesignDocListItem {
  pageId: string;
}

interface PenpotBindingResponse {
  penpotBaseUrl: string;
  activeUrl: string;
  binding?: {
    penpotUrl: string;
    publicUrl?: string;
  } | null;
  syncState?:
    | {
        remoteRevision: number | null;
        remoteVersion: number | null;
        lastForwardSyncRevision: number | null;
        lastReverseSyncRevision: number | null;
        lastReverseSyncedAt: string | null;
        hasRemoteChanges: boolean;
      }
    | {
        error: string;
      }
    | null;
}

const fetchPenpotBindingDetail = async (httpBaseUrl: string, taskId: string, pageId: string) => {
  const response = await fetch(
    `${httpBaseUrl}/api/tasks/${encodeURIComponent(taskId)}/penpot/${encodeURIComponent(pageId)}`,
  );
  return (await response.json()) as PenpotBindingResponse;
};

const postPenpotImport = async (httpBaseUrl: string, taskId: string, pageId: string) => {
  const response = await fetch(
    `${httpBaseUrl}/api/tasks/${encodeURIComponent(taskId)}/penpot/${encodeURIComponent(pageId)}/import`,
    { method: "POST" },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Penpot 回写失败");
  }
  return data;
};

const DesignPage: React.FC = () => {
  const { taskId, pageId } = useParams<{ taskId: string; pageId?: string }>();
  const navigate = useNavigate();
  const { config, store } = useWebSocketContext();
  const { isConnected } = useConnection();
  const httpBaseUrl = useMemo(() => getHttpBaseUrlFromWebSocketUrl(config.url), [config.url]);

  const [docsLoading, setDocsLoading] = useState(true);
  const [activeUrl, setActiveUrl] = useState("");
  const [error, setError] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const [isImporting, setIsImporting] = useState(false);

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

  const importFromPenpot = async (manual: boolean) => {
    if (!taskId || !pageId || isImporting) return;

    setIsImporting(true);
    setError("");

    try {
      const data = await postPenpotImport(httpBaseUrl, taskId, pageId);

      const nextStatus =
        typeof data.remoteRevision === "number"
          ? `已回写到 design doc · rev ${data.remoteRevision}`
          : "已回写到 design doc";
      setSyncStatus(nextStatus);
      if (manual) {
        toast.success("Penpot 修改已回写到 design doc");
      }
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : String(importError);
      setError(message);
      if (manual) {
        toast.error(message);
      }
    } finally {
      setIsImporting(false);
    }
  };

  useEffect(() => {
    if (!taskId || !pageId) return;

    let cancelled = false;
    let requestInFlight = false;

    const loadDetail = async (force = false) => {
      if (requestInFlight) return;
      if (!force && document.visibilityState !== "visible") return;
      requestInFlight = true;

      try {
        const bindingData = await fetchPenpotBindingDetail(httpBaseUrl, taskId, pageId);

        if (cancelled) return;
        setActiveUrl(bindingData.activeUrl || bindingData.penpotBaseUrl || "");

        if (bindingData.syncState && "error" in bindingData.syncState) {
          setSyncStatus(`同步状态不可用: ${bindingData.syncState.error}`);
          return;
        }

        if (bindingData.syncState) {
          const remoteRevision = bindingData.syncState.remoteRevision;
          if (bindingData.syncState.hasRemoteChanges) {
            setSyncStatus(
              typeof remoteRevision === "number"
                ? `检测到 Penpot 新变更 · rev ${remoteRevision}，请手动回写`
                : "检测到 Penpot 新变更，请手动回写",
            );
            return;
          }

          if (typeof bindingData.syncState.lastReverseSyncRevision === "number") {
            setSyncStatus(
              `design doc 已跟上 Penpot · rev ${bindingData.syncState.lastReverseSyncRevision}`,
            );
          } else {
            setSyncStatus("等待首次 Penpot 回写");
          }
        } else {
          setSyncStatus("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        requestInFlight = false;
      }
    };

    void loadDetail(true);
    const pollingTimer = window.setInterval(() => {
      void loadDetail();
    }, 10000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadDetail(true);
      }
    };

    const handleWindowFocus = () => {
      void loadDetail(true);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      cancelled = true;
      window.clearInterval(pollingTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
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
          {pageId && (
            <button
              type="button"
              onClick={() => void importFromPenpot(true)}
              disabled={isImporting}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium text-neutral-700 transition-colors hover:bg-black/5 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isImporting ? "animate-spin" : ""}`} />
              回写到设计稿
            </button>
          )}
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
        {syncStatus && (
          <div className="absolute right-3 top-3 z-10 rounded-full bg-slate-900/78 px-3 py-1 text-[11px] text-white shadow-lg backdrop-blur">
            {syncStatus}
          </div>
        )}
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

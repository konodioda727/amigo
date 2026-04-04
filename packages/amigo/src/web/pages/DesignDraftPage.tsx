import { useWebSocketContext } from "@amigo-llm/frontend";
import { ChevronLeft, ExternalLink, Sparkles } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getHttpBaseUrlFromWebSocketUrl } from "@/utils/sandboxEditor";

interface DesignSessionResponse {
  session: {
    pageGoal: string;
    styleKeywords: string[];
  } | null;
}

interface DesignDraftSummary {
  draftId: string;
  title: string;
  status: "draft" | "approved";
  updatedAt: string;
  revision?: number;
  basedOnLayoutId: string;
  basedOnThemeId: string;
  previewPath: string;
}

interface DesignDraftDetailResponse {
  draft: {
    draftId: string;
    title: string;
    status: "draft" | "approved";
    notes: string | null;
    revision?: number;
    basedOnLayoutId: string;
    basedOnThemeId: string;
    previewPath: string;
    critiquePath?: string | null;
    renderImagePath?: string | null;
    updatedAt: string;
  } | null;
}

interface DraftCritiqueResponse {
  critique: {
    summary: string;
    autoFixedModuleIds: string[];
    issues: Array<{
      scope: "global" | "module";
      moduleId: string | null;
      severity: "low" | "medium" | "high";
      title: string;
      detail: string;
    }>;
  } | null;
  render: {
    status: string;
    imagePath: string | null;
    message: string;
  } | null;
}

const DesignDraftPage: React.FC = () => {
  const { taskId, draftId } = useParams<{ taskId: string; draftId?: string }>();
  const navigate = useNavigate();
  const { config } = useWebSocketContext();
  const httpBaseUrl = useMemo(() => getHttpBaseUrlFromWebSocketUrl(config.url), [config.url]);

  const [brief, setBrief] = useState<DesignSessionResponse["session"]>(null);
  const [drafts, setDrafts] = useState<DesignDraftSummary[]>([]);
  const [activeDraft, setActiveDraft] = useState<DesignDraftDetailResponse["draft"]>(null);
  const [critique, setCritique] = useState<DraftCritiqueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!taskId) {
      return;
    }

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const [briefResponse, draftResponse] = await Promise.all([
          fetch(`${httpBaseUrl}/api/tasks/${encodeURIComponent(taskId)}/design-session`, {
            credentials: "include",
          }),
          fetch(`${httpBaseUrl}/api/tasks/${encodeURIComponent(taskId)}/final-design-drafts`, {
            credentials: "include",
          }),
        ]);

        const briefData = (await briefResponse.json()) as DesignSessionResponse;
        const draftData = (await draftResponse.json()) as { drafts?: DesignDraftSummary[] };

        setBrief(briefData.session || null);
        setDrafts(Array.isArray(draftData.drafts) ? draftData.drafts : []);

        if (!draftId && Array.isArray(draftData.drafts) && draftData.drafts.length > 0) {
          navigate(`/${taskId}/drafts/${draftData.drafts[0].draftId}`, { replace: true });
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [draftId, httpBaseUrl, navigate, taskId]);

  useEffect(() => {
    if (!taskId || !draftId) {
      setActiveDraft(null);
      setCritique(null);
      return;
    }

    const loadDraft = async () => {
      setError("");
      try {
        const [detailResponse, critiqueResponse] = await Promise.all([
          fetch(
            `${httpBaseUrl}/api/tasks/${encodeURIComponent(taskId)}/final-design-drafts/${encodeURIComponent(draftId)}`,
            {
              credentials: "include",
            },
          ),
          fetch(
            `${httpBaseUrl}/api/tasks/${encodeURIComponent(taskId)}/final-design-drafts/${encodeURIComponent(draftId)}/critique`,
            {
              credentials: "include",
            },
          ),
        ]);
        const data = (await detailResponse.json()) as DesignDraftDetailResponse;
        const critiqueData = (await critiqueResponse.json()) as DraftCritiqueResponse;
        setActiveDraft(data.draft || null);
        setCritique(critiqueData || null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    };

    void loadDraft();
  }, [draftId, httpBaseUrl, taskId]);

  const previewUrl =
    taskId && activeDraft?.previewPath ? `${httpBaseUrl}${activeDraft.previewPath}` : "";
  const renderImageUrl =
    taskId && critique?.render?.imagePath ? `${httpBaseUrl}${critique.render.imagePath}` : "";

  return (
    <div className="flex h-full w-full min-h-0 bg-[#f3f1ea] text-slate-900">
      <aside className="hidden w-[320px] shrink-0 border-r border-slate-200/80 bg-white/80 p-6 backdrop-blur lg:flex lg:flex-col">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <Sparkles className="h-4 w-4" />
          Final Drafts
        </div>
        <div className="mt-4 space-y-3">
          <Link
            to={taskId ? `/${taskId}` : "/"}
            className="inline-flex items-center gap-2 text-sm text-slate-600 transition-colors hover:text-slate-950"
          >
            <ChevronLeft className="h-4 w-4" />
            返回会话
          </Link>
          {brief && (
            <div className="rounded-3xl border border-slate-200 bg-[#fbfaf6] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Design Session
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-700">{brief.pageGoal}</p>
              {brief.styleKeywords.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {brief.styleKeywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="rounded-full bg-slate-900 px-2.5 py-1 text-xs text-white"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex-1 space-y-3 overflow-auto pb-4">
          {drafts.map((draft) => {
            const active = draft.draftId === draftId;
            return (
              <button
                key={draft.draftId}
                type="button"
                onClick={() => navigate(`/${taskId}/drafts/${draft.draftId}`)}
                className={`w-full rounded-3xl border p-4 text-left transition-all ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">{draft.title}</div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${
                      active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {draft.status}
                  </span>
                </div>
                <div className={`mt-2 text-xs ${active ? "text-white/70" : "text-slate-500"}`}>
                  更新于 {new Date(draft.updatedAt).toLocaleString()}
                </div>
              </button>
            );
          })}
          {!loading && drafts.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-6 text-sm text-slate-500">
              当前任务还没有 final design draft。
            </div>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur md:px-6">
          <div className="min-w-0">
            <Link
              to={taskId ? `/${taskId}` : "/"}
              className="inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-900 lg:hidden"
            >
              <ChevronLeft className="h-4 w-4" />
              返回
            </Link>
            <div className="mt-1 truncate text-lg font-semibold">
              {activeDraft?.title || "Final Design Draft Preview"}
            </div>
            {activeDraft?.notes && (
              <div className="text-sm text-slate-500">{activeDraft.notes}</div>
            )}
            {activeDraft && (
              <div className="text-xs text-slate-400">
                布局 {activeDraft.basedOnLayoutId} · 主题 {activeDraft.basedOnThemeId}
                {typeof activeDraft.revision === "number" ? ` · rev ${activeDraft.revision}` : ""}
              </div>
            )}
          </div>

          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-950"
            >
              <ExternalLink className="h-4 w-4" />
              新窗口打开
            </a>
          )}
        </header>

        <div className="flex-1 overflow-hidden p-3 md:p-5">
          {error && (
            <div className="mb-3 rounded-2xl bg-rose-500 px-4 py-2 text-sm text-white">{error}</div>
          )}
          {(critique?.render || critique?.critique) && (
            <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              {renderImageUrl ? (
                <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.08)]">
                  <img src={renderImageUrl} alt="Rendered draft" className="block h-auto w-full" />
                </div>
              ) : (
                <div className="flex min-h-[180px] items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-white/70 text-sm text-slate-500">
                  {critique?.render?.message || "当前没有截图 artifact"}
                </div>
              )}
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_16px_48px_rgba(15,23,42,0.08)]">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Critique
                </div>
                <div className="mt-3 text-sm leading-6 text-slate-700">
                  {critique?.critique?.summary || critique?.render?.message || "当前没有 critique"}
                </div>
                {critique?.critique?.autoFixedModuleIds?.length ? (
                  <div className="mt-3 text-xs text-slate-500">
                    自动返工模块: {critique.critique.autoFixedModuleIds.join(", ")}
                  </div>
                ) : null}
                {critique?.critique?.issues?.length ? (
                  <div className="mt-4 space-y-3">
                    {critique.critique.issues.slice(0, 4).map((issue, index) => (
                      <div
                        key={`${issue.title}-${index}`}
                        className="rounded-2xl bg-slate-50 px-4 py-3"
                      >
                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                          {issue.severity} · {issue.scope}
                          {issue.moduleId ? ` · ${issue.moduleId}` : ""}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {issue.title}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">{issue.detail}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )}
          {!previewUrl ? (
            <div className="flex h-full items-center justify-center rounded-[32px] border border-dashed border-slate-300 bg-white/70 text-sm text-slate-500">
              {loading ? "正在加载草稿..." : "请选择一个 design draft"}
            </div>
          ) : (
            <iframe
              title={activeDraft?.title || "Final Design Draft Preview"}
              src={previewUrl}
              className="h-full w-full rounded-[32px] border border-slate-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.08)]"
            />
          )}
        </div>
      </section>
    </div>
  );
};

export default DesignDraftPage;

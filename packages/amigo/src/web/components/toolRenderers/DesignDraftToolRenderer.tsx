import {
  type ToolMessageRendererProps,
  useSendMessage,
  useWebSocketContext,
} from "@amigo-llm/frontend";
import type { ToolNames } from "@amigo-llm/types";
import type React from "react";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { getHttpBaseUrlFromWebSocketUrl } from "@/utils/sandboxEditor";

type DeviceMode = "desktop" | "mobile";

interface DraftPreviewItem {
  draftId: string;
  title: string;
  previewPath: string;
}

interface DraftCritiqueIssue {
  scope: "global" | "module";
  moduleId: string | null;
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
  recommendation: string;
}

interface DraftCritiqueData {
  summary: string;
  autoFixedModuleIds: string[];
  issues: DraftCritiqueIssue[];
}

interface DraftRenderData {
  status: "disabled" | "skipped" | "captured" | "failed";
  imagePath: string | null;
  message: string;
}

interface DraftCritiqueResponse {
  critique: DraftCritiqueData | null;
  render: DraftRenderData | null;
}

const PREVIEW_DIMENSIONS: Record<
  DeviceMode,
  {
    label: string;
    cardViewportClassName: string;
    modalViewportClassName: string;
  }
> = {
  desktop: {
    label: "PC",
    cardViewportClassName: "aspect-video",
    modalViewportClassName: "aspect-video w-[min(1200px,92vw)]",
  },
  mobile: {
    label: "Mobile",
    cardViewportClassName: "aspect-[390/844]",
    modalViewportClassName: "aspect-[390/844] w-[min(390px,92vw)]",
  },
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const readDraftPreviewItems = (toolOutput: unknown): DraftPreviewItem[] => {
  const output = asRecord(toolOutput);
  if (!output) {
    return [];
  }

  const collectItem = (value: unknown): DraftPreviewItem | null => {
    const row = asRecord(value);
    if (!row || typeof row.previewPath !== "string" || typeof row.draftId !== "string") {
      return null;
    }

    return {
      draftId: row.draftId,
      title: typeof row.title === "string" ? row.title : row.draftId,
      previewPath: row.previewPath,
    };
  };

  const drafts = Array.isArray(output.drafts)
    ? output.drafts.map(collectItem).filter((item): item is DraftPreviewItem => Boolean(item))
    : [];

  if (drafts.length > 0) {
    return drafts;
  }

  const singleDraft = collectItem(output.draft);
  return singleDraft ? [singleDraft] : [];
};

const readPrimaryDraftId = (toolOutput: unknown): string | null => {
  const output = asRecord(toolOutput);
  if (!output) {
    return null;
  }

  if (typeof output.draftId === "string" && output.draftId) {
    return output.draftId;
  }

  const draft = asRecord(output.draft);
  if (typeof draft?.draftId === "string" && draft.draftId) {
    return draft.draftId;
  }

  const drafts = Array.isArray(output.drafts) ? output.drafts : [];
  for (const item of drafts) {
    const row = asRecord(item);
    if (typeof row?.draftId === "string" && row.draftId) {
      return row.draftId;
    }
  }

  return null;
};

const readTaskId = (toolOutput: unknown): string | null => {
  const output = asRecord(toolOutput);
  return typeof output?.taskId === "string" && output.taskId ? output.taskId : null;
};

const DesignDraftPreviewModal: React.FC<{
  draft: DraftPreviewItem | null;
  previewUrl: string;
  deviceMode: DeviceMode;
  onClose: () => void;
}> = ({ draft, previewUrl, deviceMode, onClose }) => {
  useEffect(() => {
    if (!draft) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draft, onClose]);

  if (!draft) {
    return null;
  }

  const stopPropagation = (event: MouseEvent) => event.stopPropagation();
  const viewportClassName = PREVIEW_DIMENSIONS[deviceMode].modalViewportClassName;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={draft.title}
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-6xl flex-col items-center gap-3"
        onClick={stopPropagation}
      >
        <div className="flex w-full justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/92 px-4 py-1.5 text-xs font-medium text-neutral-800 shadow-sm transition-colors hover:bg-white"
          >
            关闭
          </button>
        </div>
        <div
          className={`overflow-hidden rounded-[28px] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.2)] ${viewportClassName}`}
        >
          <iframe title={draft.title} src={previewUrl} className="h-full w-full bg-white" />
        </div>
      </div>
    </div>
  );
};

export const DesignDraftToolRenderer: React.FC<ToolMessageRendererProps<ToolNames>> = ({
  message,
  isLatest,
}) => {
  const { config } = useWebSocketContext();
  const { sendMessage } = useSendMessage();
  const httpBaseUrl = useMemo(() => getHttpBaseUrlFromWebSocketUrl(config.url), [config.url]);
  const drafts = useMemo(() => readDraftPreviewItems(message.toolOutput), [message.toolOutput]);
  const primaryDraftId = useMemo(
    () => readPrimaryDraftId(message.toolOutput),
    [message.toolOutput],
  );
  const taskId = useMemo(() => readTaskId(message.toolOutput), [message.toolOutput]);
  const [expandedDraft, setExpandedDraft] = useState<DraftPreviewItem | null>(null);
  const [deviceMode, setDeviceMode] = useState<DeviceMode>("desktop");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [critiqueData, setCritiqueData] = useState<DraftCritiqueResponse | null>(null);
  const paramsRecord = useMemo(() => asRecord(message.params), [message.params]);
  const draftAction = useMemo(() => {
    if (typeof paramsRecord?.action === "string" && paramsRecord.action) {
      return paramsRecord.action;
    }
    const output = asRecord(message.toolOutput);
    return typeof output?.action === "string" ? output.action : "";
  }, [message.toolOutput, paramsRecord]);

  useEffect(() => {
    if (!taskId || !primaryDraftId) {
      setCritiqueData(null);
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    const shouldPoll =
      message.toolName === "orchestrateFinalDesignDraft" ||
      (message.toolName === "designDraft" &&
        (draftAction === "generate" || draftAction === "revise"));

    const loadCritique = async () => {
      try {
        const response = await fetch(
          `${httpBaseUrl}/api/tasks/${encodeURIComponent(taskId)}/final-design-drafts/${encodeURIComponent(primaryDraftId)}/critique`,
          {
            credentials: "include",
          },
        );
        const data = (await response.json()) as DraftCritiqueResponse;
        if (!cancelled) {
          setCritiqueData(data);
          const renderStatus = data.render?.status;
          const shouldContinuePolling =
            shouldPoll &&
            (!renderStatus ||
              (renderStatus !== "captured" &&
                renderStatus !== "failed" &&
                renderStatus !== "disabled"));
          if (shouldContinuePolling) {
            timer = window.setTimeout(loadCritique, 5000);
          }
        }
      } catch {
        if (!cancelled) {
          setCritiqueData(null);
          if (shouldPoll) {
            timer = window.setTimeout(loadCritique, 5000);
          }
        }
      }
    };

    void loadCritique();
    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [draftAction, httpBaseUrl, message.toolName, primaryDraftId, taskId]);

  const summary =
    typeof (message.toolOutput as Record<string, unknown> | undefined)?.message === "string"
      ? String((message.toolOutput as Record<string, unknown>).message)
      : drafts.length > 0
        ? `已生成 ${drafts.length} 个设计方向`
        : "设计草稿处理中";
  const canSelect = isLatest && !message.partial && !message.hasError;
  const hasSelected = selectedDraftId !== null;
  const viewportClassName = PREVIEW_DIMENSIONS[deviceMode].cardViewportClassName;

  const handleSelectDraft = (draft: DraftPreviewItem) => {
    if (!canSelect || hasSelected) {
      return;
    }

    setSelectedDraftId(draft.draftId);
    sendMessage(
      `我选择设计稿 ${draft.title}（${draft.draftId}）作为继续迭代方向，请基于这个方案继续优化。`,
    );
  };

  return (
    <>
      {message.hasError && message.error ? (
        <div className="mb-4 max-w-[95%] px-1 text-sm text-red-600">{message.error}</div>
      ) : (
        <div className="mb-4 max-w-[95%] px-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="font-medium text-neutral-900">
                <span className={message.partial ? "loading-shimmer" : ""}>{summary}</span>
              </div>
              {drafts.length > 0 && (
                <div className="text-xs text-neutral-500">
                  点击任一方案即视为选择方向，系统会自动继续基于该方案迭代。
                </div>
              )}
            </div>
            <div className="inline-flex rounded-full border border-neutral-200 bg-white p-1">
              {(Object.keys(PREVIEW_DIMENSIONS) as DeviceMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDeviceMode(mode)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    deviceMode === mode
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-500 hover:text-neutral-900"
                  }`}
                >
                  {PREVIEW_DIMENSIONS[mode].label}
                </button>
              ))}
            </div>
          </div>

          {critiqueData?.render && (
            <div className="mt-4 rounded-[24px] border border-neutral-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-neutral-900">Latest Critique</div>
                  <div className="text-xs text-neutral-500">{critiqueData.render.message}</div>
                </div>
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-neutral-600">
                  {critiqueData.render.status}
                </span>
              </div>
              {critiqueData.render.imagePath && (
                <div className="mt-4 overflow-hidden rounded-[20px] border border-neutral-200 bg-neutral-50">
                  <img
                    src={`${httpBaseUrl}${critiqueData.render.imagePath}`}
                    alt="Draft render"
                    className="block h-auto w-full"
                  />
                </div>
              )}
              {critiqueData.critique && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                    {critiqueData.critique.summary}
                  </div>
                  {critiqueData.critique.autoFixedModuleIds.length > 0 && (
                    <div className="text-xs text-neutral-500">
                      自动返工模块: {critiqueData.critique.autoFixedModuleIds.join(", ")}
                    </div>
                  )}
                  {critiqueData.critique.issues.length > 0 && (
                    <div className="grid gap-2">
                      {critiqueData.critique.issues.slice(0, 4).map((issue, index) => (
                        <div
                          key={`${issue.title}-${index}`}
                          className="rounded-2xl border border-neutral-200 px-4 py-3"
                        >
                          <div className="flex items-center gap-2 text-xs text-neutral-500">
                            <span>{issue.severity}</span>
                            <span>{issue.scope}</span>
                            {issue.moduleId && <span>{issue.moduleId}</span>}
                          </div>
                          <div className="mt-1 text-sm font-medium text-neutral-900">
                            {issue.title}
                          </div>
                          <div className="mt-1 text-sm text-neutral-600">{issue.detail}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {drafts.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {drafts.map((draft) => {
                const previewUrl = `${httpBaseUrl}${draft.previewPath}`;
                const isSelected = selectedDraftId === draft.draftId;
                const isOtherSelected = hasSelected && !isSelected;
                const showActionBar = canSelect && !hasSelected;

                return (
                  <div key={draft.draftId} className="space-y-2">
                    <div
                      className={`group block w-full text-left transition-all ${
                        isOtherSelected ? "opacity-45" : "opacity-100"
                      }`}
                    >
                      <div
                        className={`relative overflow-hidden rounded-[24px] transition-all ${
                          isSelected
                            ? "shadow-[0_16px_44px_rgba(239,90,71,0.24)]"
                            : "shadow-[0_12px_34px_rgba(15,23,42,0.08)]"
                        }`}
                      >
                        <div
                          className={`overflow-hidden rounded-[24px] bg-white ${viewportClassName}`}
                        >
                          <iframe
                            title={draft.title}
                            src={previewUrl}
                            className="h-full w-full bg-white"
                          />
                        </div>
                        <div
                          className={`pointer-events-none absolute inset-0 rounded-[24px] transition-all duration-200 ${
                            isSelected
                              ? "bg-[#111111]/48 opacity-100"
                              : isOtherSelected
                                ? "bg-white/62 opacity-100"
                                : showActionBar
                                  ? "opacity-100"
                                  : "opacity-0"
                          }`}
                        >
                          {isSelected ? (
                            <div className="flex h-full items-center justify-center">
                              <span className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-[#111111] shadow-sm">
                                已选择
                              </span>
                            </div>
                          ) : isOtherSelected ? (
                            <div className="flex h-full items-center justify-center">
                              <span className="rounded-full bg-white/92 px-4 py-1.5 text-sm font-medium text-neutral-500 shadow-sm">
                                未选
                              </span>
                            </div>
                          ) : null}
                        </div>
                        {showActionBar && (
                          <>
                            <div className="pointer-events-none absolute inset-0 rounded-[24px] bg-[#111111]/22 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                            <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                              <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-white/96 p-1 shadow-lg shadow-black/10">
                                <button
                                  type="button"
                                  onClick={() => handleSelectDraft(draft)}
                                  className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-800"
                                >
                                  选择方案
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setExpandedDraft(draft)}
                                  className="rounded-full px-4 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                                >
                                  放大查看
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="px-2 pt-1 text-center">
                      <div className="truncate text-base font-semibold text-neutral-900">
                        {draft.title}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
              {primaryDraftId
                ? `草稿 ${primaryDraftId} 正在编排或还没有可展示的 preview。`
                : "这次工具输出里还没有可展示的 design draft preview。"}
            </div>
          )}
        </div>
      )}
      <DesignDraftPreviewModal
        draft={expandedDraft}
        previewUrl={expandedDraft ? `${httpBaseUrl}${expandedDraft.previewPath}` : ""}
        deviceMode={deviceMode}
        onClose={() => setExpandedDraft(null)}
      />
    </>
  );
};

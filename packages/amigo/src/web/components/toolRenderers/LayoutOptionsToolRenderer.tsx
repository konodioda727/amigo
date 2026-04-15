import {
  ToolAccordion,
  type ToolMessageRendererProps,
  useSendMessage,
  useWebSocketContext,
} from "@amigo-llm/frontend";
import type { ToolNames } from "@amigo-llm/types";
import type React from "react";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getHttpBaseUrlFromWebSocketUrl } from "@/utils/sandboxEditor";

interface DesignModule {
  id: string;
  label: string;
  summary: string;
  priority: "primary" | "secondary" | "support";
}

interface LayoutOption {
  layoutId: string;
  title: string;
  description: string;
  source: string;
  previewPath?: string;
  moduleIds: string[];
  canvasWidth: number;
  canvasHeight: number;
  validationErrors?: string[];
  isDraft?: boolean;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const takeLeadingSentence = (value: string) => {
  const trimmed = value.trim();
  const sentenceEnd = trimmed.indexOf("。");
  return sentenceEnd >= 0 ? trimmed.slice(0, sentenceEnd + 1) : trimmed;
};

const readLayoutOptionsFromArray = (value: unknown, isDraft = false): LayoutOption[] =>
  Array.isArray(value)
    ? value
        .map<LayoutOption | null>((item) => {
          const row = asRecord(item);
          if (!row || typeof row.layoutId !== "string" || typeof row.title !== "string") {
            return null;
          }
          return {
            layoutId: row.layoutId,
            title: row.title,
            description: typeof row.description === "string" ? row.description : "",
            source: typeof row.source === "string" ? row.source : "",
            ...(typeof row.previewPath === "string" ? { previewPath: row.previewPath } : {}),
            moduleIds: Array.isArray(row.moduleIds)
              ? row.moduleIds.filter((entry): entry is string => typeof entry === "string")
              : [],
            validationErrors: Array.isArray(row.validationErrors)
              ? row.validationErrors.filter((entry): entry is string => typeof entry === "string")
              : [],
            isDraft,
            canvasWidth:
              typeof row.canvasWidth === "number"
                ? row.canvasWidth
                : typeof row.canvasWidth === "string" &&
                    /^\d+(\.\d+)?$/.test(row.canvasWidth.trim())
                  ? Number(row.canvasWidth.trim())
                  : 1440,
            canvasHeight:
              typeof row.canvasHeight === "number"
                ? row.canvasHeight
                : typeof row.canvasHeight === "string" &&
                    /^\d+(\.\d+)?$/.test(row.canvasHeight.trim())
                  ? Number(row.canvasHeight.trim())
                  : 1600,
          };
        })
        .filter((item): item is LayoutOption => Boolean(item))
    : [];

const readLayoutOptions = (
  toolOutput: unknown,
  params?: unknown,
): {
  summary: string;
  options: LayoutOption[];
  draftOptions: LayoutOption[];
  modules: DesignModule[];
  selectedLayoutId: string | null;
  validationErrors: string[];
  source: "toolOutput" | "params";
} => {
  const output = asRecord(toolOutput);
  if (!output) {
    return {
      summary: "布局方案处理中",
      options: readLayoutOptionsFromArray(asRecord(params)?.options),
      draftOptions: readLayoutOptionsFromArray(asRecord(params)?.draftOptions, true),
      modules: [],
      selectedLayoutId: null,
      validationErrors: [],
      source: "params",
    };
  }

  const optionsFromOutput = readLayoutOptionsFromArray(output.options);
  const draftOptionsFromOutput = readLayoutOptionsFromArray(output.draftOptions, true);
  const optionsFromParams = readLayoutOptionsFromArray(asRecord(params)?.options);
  const draftOptionsFromParams = readLayoutOptionsFromArray(asRecord(params)?.draftOptions, true);
  const options = optionsFromOutput.length > 0 ? optionsFromOutput : optionsFromParams;
  const draftOptions =
    draftOptionsFromOutput.length > 0 ? draftOptionsFromOutput : draftOptionsFromParams;

  const modules = Array.isArray(output.modules)
    ? output.modules
        .map((item) => {
          const row = asRecord(item);
          if (!row || typeof row.id !== "string" || typeof row.label !== "string") {
            return null;
          }
          return {
            id: row.id,
            label: row.label,
            summary: typeof row.summary === "string" ? row.summary : "",
            priority:
              row.priority === "primary" ||
              row.priority === "secondary" ||
              row.priority === "support"
                ? row.priority
                : "secondary",
          };
        })
        .filter((item): item is DesignModule => Boolean(item))
    : [];

  return {
    summary: typeof output.message === "string" ? output.message : "布局方案候选",
    options,
    draftOptions,
    modules,
    selectedLayoutId:
      typeof output.selectedLayoutId === "string" && output.selectedLayoutId
        ? output.selectedLayoutId
        : null,
    validationErrors: Array.isArray(output.validationErrors)
      ? output.validationErrors.filter((value): value is string => typeof value === "string")
      : [],
    source:
      optionsFromOutput.length > 0 || draftOptionsFromOutput.length > 0 ? "toolOutput" : "params",
  };
};

const createSkeletonPreviewMarkup = (option: LayoutOption, modules: DesignModule[]) => {
  const moduleLabelMap = new Map(modules.map((module) => [module.id, module.label]));
  const trimmedSource = option.source
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const firstTagIndex = trimmedSource.indexOf("<");
  const lastTagIndex = trimmedSource.lastIndexOf(">");
  const safeSource =
    firstTagIndex >= 0 && lastTagIndex >= firstTagIndex
      ? trimmedSource.slice(firstTagIndex, lastTagIndex + 1)
      : trimmedSource;

  return safeSource.replace(/data-module-id=(["'])([^"']+)\1/g, (fullMatch, quote, moduleId) => {
    const normalizedId = String(moduleId || "").trim();
    const label = moduleLabelMap.get(normalizedId) || normalizedId;
    return `${fullMatch} data-module-label=${quote}${label}${quote}`;
  });
};

const LayoutPreviewFrame: React.FC<{
  option: LayoutOption;
  modules: DesignModule[];
  previewUrl?: string;
  className?: string;
}> = ({ option, modules, previewUrl, className }) => {
  const skeletonMarkup = useMemo(
    () => createSkeletonPreviewMarkup(option, modules),
    [option, modules],
  );

  if (!previewUrl) {
    return (
      <div
        className={className}
        style={{
          background: "#f5f5f4",
          color: "#111827",
          fontFamily: '"SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif',
          overflow: "auto",
        }}
      >
        <style>
          {`*{box-sizing:border-box} [data-module-id]{position:relative;outline:1px dashed rgba(15,23,42,0.18);outline-offset:-1px;min-height:80px} [data-module-id]::before{content:attr(data-module-label);position:absolute;top:10px;left:10px;z-index:2;border-radius:999px;background:rgba(15,23,42,0.92);color:#fff;padding:4px 10px;font-size:12px;font-weight:600;line-height:1} [data-slot]{border-radius:14px;border:1px dashed rgba(100,116,139,0.42);background:rgba(255,255,255,0.68);min-height:40px} main,section,article,aside,header,footer,nav,div{box-sizing:border-box}`}
        </style>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Preview markup is generated from internal layout source for local rendering only. */}
        <div dangerouslySetInnerHTML={{ __html: skeletonMarkup }} />
      </div>
    );
  }

  return (
    <iframe
      key={`compiled:${option.layoutId}:${previewUrl}`}
      title={option.title}
      className={className}
      sandbox="allow-same-origin"
      src={previewUrl}
    />
  );
};

const LayoutPreviewModal: React.FC<{
  openOption: LayoutOption | null;
  modules: DesignModule[];
  httpBaseUrl: string;
  onClose: () => void;
}> = ({ openOption, modules, httpBaseUrl, onClose }) => {
  if (!openOption) {
    return null;
  }

  const stopPropagation = (event: MouseEvent) => event.stopPropagation();

  return (
    <div
      className="fixed inset-0 z-[100] flex bg-white"
      role="dialog"
      aria-modal="true"
      aria-label={openOption.title}
      onClick={onClose}
    >
      <div className="relative flex h-full w-full flex-col" onClick={stopPropagation}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-neutral-900">
              {openOption.title}
            </div>
            {openOption.description ? (
              <div className="mt-1 truncate text-sm text-neutral-500">{openOption.description}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-200"
          >
            关闭
          </button>
        </div>
        <div className="h-[calc(100vh-73px)] w-full">
          <LayoutPreviewFrame
            option={openOption}
            modules={modules}
            previewUrl={
              openOption.previewPath ? `${httpBaseUrl}${openOption.previewPath}` : undefined
            }
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>
  );
};

export const LayoutOptionsToolRenderer: React.FC<ToolMessageRendererProps<ToolNames>> = ({
  message,
  isLatest,
}) => {
  const toolName = String(message.toolName || "");
  const paramsRecord = asRecord(message.params);
  const action =
    typeof paramsRecord?.action === "string"
      ? paramsRecord.action
      : typeof asRecord(message.toolOutput)?.action === "string"
        ? String(asRecord(message.toolOutput)?.action)
        : "";
  const { config } = useWebSocketContext();
  const { taskId } = useParams<{ taskId: string }>();
  const { sendMessage } = useSendMessage();
  const httpBaseUrl = useMemo(() => getHttpBaseUrlFromWebSocketUrl(config.url), [config.url]);
  const { summary, options, draftOptions, modules, selectedLayoutId, validationErrors, source } =
    useMemo(
      () => readLayoutOptions(message.toolOutput, message.params),
      [message.toolOutput, message.params],
    );
  const [expandedOption, setExpandedOption] = useState<LayoutOption | null>(null);
  const [persistedSelectedId, setPersistedSelectedId] = useState<string | null>(null);
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const activeSelectedId = selectedLayoutId || persistedSelectedId || localSelectedId;
  const canSelect = isLatest && !message.partial && !message.hasError && source === "toolOutput";
  const hasBlockingError = message.hasError || validationErrors.length > 0;
  const isReadOnlySummary =
    toolName === "readLayoutOptions" || (toolName === "designOptions" && action === "read");
  const displaySummary = isReadOnlySummary ? takeLeadingSentence(summary) : summary;

  useEffect(() => {
    if (!taskId) {
      setPersistedSelectedId(null);
      return;
    }

    let cancelled = false;

    const loadPersistedSelection = async () => {
      try {
        const response = await fetch(
          `${httpBaseUrl}/api/tasks/${encodeURIComponent(taskId)}/layout-options`,
          {
            credentials: "include",
          },
        );
        if (!response.ok) {
          return;
        }

        const payload = (await response.json().catch(() => null)) as {
          selectedLayoutId?: string | null;
        } | null;

        if (!cancelled) {
          setPersistedSelectedId(
            typeof payload?.selectedLayoutId === "string" && payload.selectedLayoutId
              ? payload.selectedLayoutId
              : null,
          );
        }
      } catch {
        if (!cancelled) {
          setPersistedSelectedId(null);
        }
      }
    };

    void loadPersistedSelection();
    return () => {
      cancelled = true;
    };
  }, [httpBaseUrl, taskId]);

  const previewGrid = (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {[...options, ...draftOptions].map((option) => {
        const isSelected = activeSelectedId === option.layoutId;
        const isOtherSelected = Boolean(activeSelectedId) && !isSelected;
        const isSelecting = selectingId === option.layoutId;
        const previewUrl = option.previewPath ? `${httpBaseUrl}${option.previewPath}` : undefined;
        const isDraft = option.isDraft === true;

        return (
          <div
            key={option.layoutId}
            className={`group space-y-3 text-left transition-all ${
              isOtherSelected ? "opacity-45" : "opacity-100"
            }`}
          >
            <div
              className={`relative overflow-hidden rounded-[28px] border border-[#ebe5d8] bg-[#fbfaf6] p-3 shadow-[0_12px_34px_rgba(15,23,42,0.08)] ${
                isSelected ? "ring-2 ring-[#ef5a47]" : ""
              }`}
            >
              <div className="overflow-hidden rounded-[22px] border border-neutral-200 bg-white">
                <LayoutPreviewFrame
                  option={option}
                  modules={modules}
                  previewUrl={previewUrl}
                  className="aspect-[16/10] w-full border-0"
                />
              </div>

              {!isSelected && !isOtherSelected ? (
                <>
                  <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-[#111111]/0 opacity-0 transition-opacity duration-200 group-hover:bg-[#111111]/18 group-hover:opacity-100" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-white/96 p-1 shadow-lg shadow-black/10">
                      <button
                        type="button"
                        onClick={() => setExpandedOption(option)}
                        className="rounded-full px-4 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
                      >
                        放大查看
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSelect(option)}
                        disabled={!canSelect || isDraft}
                        className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
                      >
                        {isDraft ? "待修订" : "选择布局"}
                      </button>
                    </div>
                  </div>
                </>
              ) : null}

              <div
                className={`pointer-events-none absolute inset-0 flex items-center justify-center rounded-[28px] transition-opacity ${
                  isSelected
                    ? "bg-[#111111]/45 opacity-100"
                    : isOtherSelected
                      ? "bg-white/62 opacity-100"
                      : isSelecting
                        ? "bg-[#111111]/28 opacity-100"
                        : "opacity-0"
                }`}
              >
                {isSelected || isOtherSelected || isSelecting ? (
                  <span className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-neutral-900 shadow-sm">
                    {isSelected ? "已选择" : isOtherSelected ? "未选" : "提交中"}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="space-y-2 text-center">
              <div className="text-base font-semibold text-neutral-900">
                {option.title}
                {isDraft ? (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    待修订
                  </span>
                ) : null}
              </div>
              {option.description ? (
                <div className="text-xs leading-5 text-neutral-500">{option.description}</div>
              ) : null}
              {option.validationErrors && option.validationErrors.length > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                  {option.validationErrors[0]}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );

  const handleSelect = async (option: LayoutOption) => {
    if (!canSelect || activeSelectedId || selectingId || !taskId) {
      return;
    }

    try {
      setSelectingId(option.layoutId);
      setSelectionError(null);
      const response = await fetch(
        `${httpBaseUrl}/api/tasks/${encodeURIComponent(taskId)}/layout-options/selection`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ layoutId: option.layoutId }),
        },
      );
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "选择布局失败");
      }
      setPersistedSelectedId(option.layoutId);
      setLocalSelectedId(option.layoutId);
      sendMessage(
        `我已经选择布局方案 ${option.title}（${option.layoutId}）。现在继续调用 designOptions，参数 kind="theme", action="generate"，基于这个布局生成 2-3 个主题方案。`,
      );
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "选择布局失败");
    } finally {
      setSelectingId(null);
    }
  };

  if (hasBlockingError) {
    const errorLines = Array.from(
      new Set(
        [
          ...(message.error ? [message.error] : []),
          ...validationErrors,
          ...(draftOptions.flatMap((option) => option.validationErrors || []) || []),
        ]
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );

    return (
      <ToolAccordion title={summary} hasError error={message.error || errorLines[0]}>
        <div className="text-xs text-neutral-500">
          这次布局工具没有通过校验，前端已隐藏所有布局预览和选择入口，避免干扰后续修复。
        </div>
        {errorLines.length > 0 ? (
          <div className="mt-3 space-y-2">
            {errorLines.map((errorLine) => (
              <div
                key={errorLine}
                className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700"
              >
                {errorLine}
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-3 text-xs text-neutral-500">
          下一步应先读取现有布局草稿，再基于原 `layoutId` 做 patch。
        </div>
      </ToolAccordion>
    );
  }

  if (isReadOnlySummary) {
    return <ToolAccordion title={displaySummary} isLoading={message.partial} />;
  }

  return (
    <>
      <ToolAccordion title={displaySummary} isExpandedDefault isLoading={message.partial}>
        <div className="text-xs text-neutral-500">
          先确认页面骨架和五个区域的位置，再进入配色和最终视觉阶段。
        </div>
        {selectionError ? <div className="mt-2 text-xs text-red-600">{selectionError}</div> : null}

        {previewGrid}
      </ToolAccordion>

      <LayoutPreviewModal
        openOption={expandedOption}
        modules={modules}
        httpBaseUrl={httpBaseUrl}
        onClose={() => setExpandedOption(null)}
      />
    </>
  );
};

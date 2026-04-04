import { type ToolMessageRendererProps, useWebSocketContext } from "@amigo-llm/frontend";
import type { ToolNames } from "@amigo-llm/types";
import type React from "react";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { getHttpBaseUrlFromWebSocketUrl } from "@/utils/sandboxEditor";

interface ModulePreviewItem {
  draftId: string;
  moduleId: string;
  title: string;
  status: "draft" | "revised" | "accepted";
  copySummary: string;
  previewPath: string;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const readModulePreviewItems = (toolOutput: unknown): ModulePreviewItem[] => {
  const output = asRecord(toolOutput);
  if (!output || !Array.isArray(output.modules)) {
    return [];
  }

  return output.modules
    .map((item) => {
      const row = asRecord(item);
      if (
        !row ||
        typeof row.draftId !== "string" ||
        typeof row.moduleId !== "string" ||
        typeof row.title !== "string" ||
        typeof row.previewPath !== "string"
      ) {
        return null;
      }

      return {
        draftId: row.draftId,
        moduleId: row.moduleId,
        title: row.title,
        status: row.status === "accepted" || row.status === "revised" ? row.status : "draft",
        copySummary: typeof row.copySummary === "string" ? row.copySummary : "",
        previewPath: row.previewPath,
      } satisfies ModulePreviewItem;
    })
    .filter((item): item is ModulePreviewItem => Boolean(item));
};

const ModulePreviewModal: React.FC<{
  module: ModulePreviewItem | null;
  previewUrl: string;
  onClose: () => void;
}> = ({ module, previewUrl, onClose }) => {
  useEffect(() => {
    if (!module) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [module, onClose]);

  if (!module) {
    return null;
  }

  const stopPropagation = (event: MouseEvent) => event.stopPropagation();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={module.title}
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
        <div className="h-[80vh] w-[min(1200px,92vw)] overflow-hidden rounded-[28px] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.2)]">
          <iframe title={module.title} src={previewUrl} className="h-full w-full bg-white" />
        </div>
      </div>
    </div>
  );
};

export const ModuleDraftToolRenderer: React.FC<ToolMessageRendererProps<ToolNames>> = ({
  message,
}) => {
  const { config } = useWebSocketContext();
  const httpBaseUrl = useMemo(() => getHttpBaseUrlFromWebSocketUrl(config.url), [config.url]);
  const modules = useMemo(() => readModulePreviewItems(message.toolOutput), [message.toolOutput]);
  const [expandedModule, setExpandedModule] = useState<ModulePreviewItem | null>(null);

  const summary =
    typeof (message.toolOutput as Record<string, unknown> | undefined)?.message === "string"
      ? String((message.toolOutput as Record<string, unknown>).message)
      : modules.length > 0
        ? `已生成 ${modules.length} 个模块草稿`
        : "模块草稿处理中";

  return (
    <>
      {message.hasError && message.error ? (
        <div className="mb-4 max-w-[95%] px-1 text-sm text-red-600">{message.error}</div>
      ) : (
        <div className="mb-4 max-w-[95%] px-1">
          <div className="font-medium text-neutral-900">
            <span className={message.partial ? "loading-shimmer" : ""}>{summary}</span>
          </div>

          {modules.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {modules.map((module) => {
                const previewUrl = `${httpBaseUrl}${module.previewPath}`;
                return (
                  <div
                    key={`${module.draftId}-${module.moduleId}`}
                    className="overflow-hidden rounded-[24px] border border-neutral-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.08)]"
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-neutral-900">
                          {module.title}
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">{module.moduleId}</div>
                      </div>
                      <span className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-neutral-600">
                        {module.status}
                      </span>
                    </div>
                    <div className="h-[320px] overflow-hidden bg-neutral-50">
                      <iframe
                        title={module.title}
                        src={previewUrl}
                        className="h-full w-full bg-white"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="line-clamp-2 text-xs text-neutral-500">
                        {module.copySummary || "当前模块还没有文案摘要。"}
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedModule(module)}
                        className="shrink-0 rounded-full px-4 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                      >
                        放大查看
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
              这次工具输出里还没有可展示的 module preview。
            </div>
          )}
        </div>
      )}
      <ModulePreviewModal
        module={expandedModule}
        previewUrl={expandedModule ? `${httpBaseUrl}${expandedModule.previewPath}` : ""}
        onClose={() => setExpandedModule(null)}
      />
    </>
  );
};

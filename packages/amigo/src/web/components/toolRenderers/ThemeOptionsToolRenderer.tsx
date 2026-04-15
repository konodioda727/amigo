import {
  type ToolMessageRendererProps,
  useSendMessage,
  useWebSocketContext,
} from "@amigo-llm/frontend";
import type { ToolNames } from "@amigo-llm/types";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getHttpBaseUrlFromWebSocketUrl } from "@/utils/sandboxEditor";

interface ThemeTokens {
  background: string;
  surface: string;
  surfaceAlt: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  primary: string;
  primaryText: string;
  accent: string;
  accentText: string;
  danger: string;
  success: string;
  warning: string;
  radius: string;
  shadow: string;
}

interface ThemeOption {
  themeId: string;
  title: string;
  description: string;
  tokens: ThemeTokens;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const parseThemeOptions = (
  toolOutput: unknown,
): { summary: string; options: ThemeOption[]; selectedThemeId: string | null } => {
  const output = asRecord(toolOutput);
  if (!output) {
    return { summary: "主题方案处理中", options: [], selectedThemeId: null };
  }

  const options = Array.isArray(output.options)
    ? output.options
        .map((item) => {
          const row = asRecord(item);
          const tokens = asRecord(row?.tokens);
          if (!row || !tokens || typeof row.themeId !== "string" || typeof row.title !== "string") {
            return null;
          }
          const requiredKeys = [
            "background",
            "surface",
            "surfaceAlt",
            "textPrimary",
            "textSecondary",
            "border",
            "primary",
            "primaryText",
            "accent",
            "accentText",
            "danger",
            "success",
            "warning",
            "radius",
            "shadow",
          ] as const;
          if (!requiredKeys.every((key) => typeof tokens[key] === "string")) {
            return null;
          }
          return {
            themeId: row.themeId,
            title: row.title,
            description: typeof row.description === "string" ? row.description : "",
            tokens: tokens as unknown as ThemeTokens,
          };
        })
        .filter((item): item is ThemeOption => Boolean(item))
    : [];

  return {
    summary: typeof output.message === "string" ? output.message : "主题方案候选",
    options,
    selectedThemeId:
      typeof output.selectedThemeId === "string" && output.selectedThemeId
        ? output.selectedThemeId
        : null,
  };
};

const ThemeDemoCard: React.FC<{ option: ThemeOption }> = ({ option }) => {
  const { tokens } = option;
  return (
    <div
      className="flex h-full flex-col gap-3 rounded-[22px] border p-4"
      style={{
        background: tokens.background,
        borderColor: tokens.border,
        color: tokens.textPrimary,
        boxShadow: tokens.shadow,
      }}
    >
      <div
        className="rounded-[18px] border p-4"
        style={{ background: tokens.surface, borderColor: tokens.border }}
      >
        <div className="text-sm font-semibold" style={{ color: tokens.textPrimary }}>
          标题示例
        </div>
        <div className="mt-1 text-xs leading-5" style={{ color: tokens.textSecondary }}>
          这是统一测试模块，用于同时观察按钮、输入框、卡片和状态色。
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-xs font-medium"
            style={{ background: tokens.primary, color: tokens.primaryText }}
          >
            主按钮
          </button>
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-xs font-medium"
            style={{ background: tokens.surfaceAlt, color: tokens.textPrimary }}
          >
            次按钮
          </button>
        </div>
      </div>

      <div
        className="rounded-[18px] border p-4"
        style={{ background: tokens.surfaceAlt, borderColor: tokens.border }}
      >
        <div
          className="rounded-2xl border px-3 py-2 text-xs"
          style={{
            background: tokens.surface,
            borderColor: tokens.border,
            color: tokens.textSecondary,
          }}
        >
          输入框状态
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { label: "Accent", bg: tokens.accent, color: tokens.accentText },
            { label: "Success", bg: tokens.success, color: "#fff" },
            { label: "Warning", bg: tokens.warning, color: "#111" },
            { label: "Danger", bg: tokens.danger, color: "#fff" },
          ].map((chip) => (
            <span
              key={chip.label}
              className="rounded-full px-2.5 py-1 text-[10px] font-medium"
              style={{ background: chip.bg, color: chip.color }}
            >
              {chip.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export const ThemeOptionsToolRenderer: React.FC<ToolMessageRendererProps<ToolNames>> = ({
  message,
  isLatest,
}) => {
  const { config } = useWebSocketContext();
  const { taskId } = useParams<{ taskId: string }>();
  const { sendMessage } = useSendMessage();
  const httpBaseUrl = useMemo(() => getHttpBaseUrlFromWebSocketUrl(config.url), [config.url]);
  const { summary, options, selectedThemeId } = useMemo(
    () => parseThemeOptions(message.toolOutput),
    [message.toolOutput],
  );
  const [persistedSelectedId, setPersistedSelectedId] = useState<string | null>(null);
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const activeSelectedId = selectedThemeId || persistedSelectedId || localSelectedId;
  const canSelect = isLatest && !message.partial && !message.hasError;

  useEffect(() => {
    if (!taskId) {
      setPersistedSelectedId(null);
      return;
    }

    let cancelled = false;

    const loadPersistedSelection = async () => {
      try {
        const response = await fetch(
          `${httpBaseUrl}/api/tasks/${encodeURIComponent(taskId)}/theme-options`,
          {
            credentials: "include",
          },
        );
        if (!response.ok) {
          return;
        }

        const payload = (await response.json().catch(() => null)) as {
          selectedThemeId?: string | null;
        } | null;

        if (!cancelled) {
          setPersistedSelectedId(
            typeof payload?.selectedThemeId === "string" && payload.selectedThemeId
              ? payload.selectedThemeId
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

  const handleSelect = async (option: ThemeOption) => {
    if (!canSelect || activeSelectedId || selectingId || !taskId) {
      return;
    }

    try {
      setSelectingId(option.themeId);
      setSelectionError(null);
      const response = await fetch(
        `${httpBaseUrl}/api/tasks/${encodeURIComponent(taskId)}/theme-options/selection`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ themeId: option.themeId }),
        },
      );
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "选择主题失败");
      }
      setPersistedSelectedId(option.themeId);
      setLocalSelectedId(option.themeId);
      sendMessage(
        `我已经选择主题方案 ${option.title}（${option.themeId}）。现在必须立即调用 designDraft，参数 action="generate", draftId="final-draft", title="Final Draft"，基于已选布局和这个主题生成 1 个最终界面草稿；不要先去查状态。先完成整页装配，再读取 final draft，最后再看 critique。`,
      );
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "选择主题失败");
    } finally {
      setSelectingId(null);
    }
  };

  if (message.hasError && message.error) {
    return <div className="mb-4 max-w-[95%] px-1 text-sm text-red-600">{message.error}</div>;
  }

  return (
    <div className="mb-4 max-w-[95%] px-1">
      <div className="space-y-1">
        <div className="font-medium text-neutral-900">
          <span className={message.partial ? "loading-shimmer" : ""}>{summary}</span>
        </div>
        <div className="text-xs text-neutral-500">
          用统一测试模块比较主题系统，避免被具体页面内容误导。
        </div>
      </div>
      {selectionError ? <div className="mt-2 text-xs text-red-600">{selectionError}</div> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {options.map((option) => {
          const isSelected = activeSelectedId === option.themeId;
          const isOtherSelected = Boolean(activeSelectedId) && !isSelected;
          const isSelecting = selectingId === option.themeId;
          const canClick = canSelect && !activeSelectedId && !selectingId && Boolean(taskId);

          const handleCardActivate = () => {
            if (!canClick) {
              return;
            }
            void handleSelect(option);
          };

          return (
            <div
              key={option.themeId}
              role={canClick ? "button" : undefined}
              tabIndex={canClick ? 0 : -1}
              aria-disabled={!canClick}
              onClick={handleCardActivate}
              onKeyDown={(event) => {
                if (!canClick) {
                  return;
                }

                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleCardActivate();
                }
              }}
              className={`group space-y-3 text-left transition-all ${
                isOtherSelected ? "opacity-45" : "opacity-100"
              } ${canClick ? "cursor-pointer" : ""}`}
            >
              <div
                className={`relative overflow-hidden rounded-[28px] bg-[#efe9dc] p-3 transition-all ${
                  isSelected
                    ? "shadow-[0_16px_44px_rgba(239,90,71,0.18)]"
                    : "shadow-[0_12px_34px_rgba(15,23,42,0.08)]"
                }`}
              >
                <ThemeDemoCard option={option} />
                <div
                  className={`pointer-events-none absolute inset-0 flex items-center justify-center rounded-[28px] transition-opacity ${
                    isSelected
                      ? "bg-[#111111]/45 opacity-100"
                      : isOtherSelected
                        ? "bg-white/62 opacity-100"
                        : isSelecting
                          ? "bg-[#111111]/28 opacity-100"
                          : "bg-[#111111]/0 opacity-0 group-hover:bg-[#111111]/22 group-hover:opacity-100"
                  }`}
                >
                  <span className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-neutral-900 shadow-sm">
                    {isSelected
                      ? "已选择"
                      : isOtherSelected
                        ? "未选"
                        : isSelecting
                          ? "提交中"
                          : "选择主题"}
                  </span>
                </div>
              </div>
              <div className="text-center">
                <div className="text-base font-semibold text-neutral-900">{option.title}</div>
                {option.description && (
                  <div className="mt-1 text-xs leading-5 text-neutral-500">
                    {option.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

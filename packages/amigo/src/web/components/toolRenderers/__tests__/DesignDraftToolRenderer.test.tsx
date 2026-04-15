import "../../../../../../frontend/src/sdk/provider/__tests__/setup";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { type ToolMessageRendererProps, WebSocketProvider } from "@amigo-llm/frontend";
import type { ToolNames } from "@amigo-llm/types";
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { DesignDraftToolRenderer } from "../DesignDraftToolRenderer";

describe("DesignDraftToolRenderer", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    if (container) {
      document.body.removeChild(container);
      container = null;
    }
  });

  const renderView = (element: ReactElement) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <WebSocketProvider url="ws://localhost:10013/ws" autoConnect={false}>
          {element}
        </WebSocketProvider>,
      );
    });

    return container as HTMLDivElement;
  };

  const buildMessage = (
    message: Omit<ToolMessageRendererProps<ToolNames>["message"], "type" | "updateTime">,
  ): ToolMessageRendererProps<ToolNames>["message"] => ({
    type: "tool",
    updateTime: Date.now(),
    ...message,
  });

  it("shows draft actions for designDraft read", () => {
    const view = renderView(
      <DesignDraftToolRenderer
        message={buildMessage({
          toolName: "designDraft",
          params: { action: "read", draftId: "landing-v1" },
          toolOutput: {
            success: true,
            action: "read",
            message: "已读取最终界面草稿 landing-v1",
            draft: {
              draftId: "landing-v1",
              title: "Landing V1",
              basedOnLayoutId: "layout-main",
              basedOnThemeId: "theme-light",
              revision: 2,
              updatedAt: "2026-04-02T10:00:00.000Z",
              previewPath: "/api/tasks/task-1/design-drafts/landing-v1/preview",
            },
            validationErrors: [],
          },
          partial: false,
          hasError: false,
        })}
        isLatest
      />,
    );

    expect(view.textContent).toContain("已读取最终界面草稿 landing-v1");
    expect(view.textContent).toContain("放大查看");
  });

  it("keeps designDraft generate minimal and does not render preview actions", () => {
    global.fetch = mock(
      async () =>
        ({
          ok: true,
          json: async () => ({
            critique: null,
            render: {
              status: "captured",
              imagePath: null,
              message: "captured",
            },
          }),
        }) as Response,
    ) as typeof fetch;

    const view = renderView(
      <DesignDraftToolRenderer
        message={buildMessage({
          toolName: "designDraft",
          params: {
            action: "generate",
            draftId: "landing-v1",
            title: "Landing V1",
          },
          toolOutput: {
            success: true,
            action: "generate",
            message:
              "已启动最终设计稿编排（执行编号: exec-1）。后台正在设计中；现在应立即告知用户后台已开始执行，并结束本轮，不要继续读取状态。",
            draftId: "landing-v1",
            title: "Landing V1",
            async: true,
            status: "started",
            executionId: "exec-1",
            startedAt: "2026-04-02T10:00:00.000Z",
            taskId: "task-1",
            validationErrors: [],
          },
          partial: false,
          hasError: false,
        })}
        isLatest
      />,
    );

    expect(view.textContent).toContain("已启动最终设计稿编排");
    expect(view.textContent).not.toContain("查看草稿");
    expect(view.querySelector("iframe")).toBeNull();
  });
});

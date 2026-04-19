import "../../provider/__tests__/setup";
import { describe, expect, it, mock } from "bun:test";
import { render } from "@testing-library/react";
import type { DisplayMessageType } from "../../messages/types";

const getMockItemKey = (item: unknown): string => {
  if (!item || typeof item !== "object") {
    return String(item);
  }

  if ("updateTime" in item && typeof item.updateTime === "number") {
    const type = "type" in item && typeof item.type === "string" ? item.type : "item";
    return `${type}-${item.updateTime}`;
  }

  return JSON.stringify(item);
};

mock.module("react-virtuoso", () => ({
  Virtuoso: ({
    data,
    itemContent,
  }: {
    data: unknown[];
    itemContent: (index: number, item: any) => JSX.Element;
  }) => (
    <div>
      {data.map((item, index) => (
        <div key={getMockItemKey(item)}>{itemContent(index, item)}</div>
      ))}
    </div>
  ),
}));

describe("ChatWindow", () => {
  it("renders process messages inline before finishPhase", async () => {
    const { WebSocketProvider } = await import("../../provider/WebSocketProvider");
    const { ChatWindow } = await import("../ChatWindow");
    const taskId = "task-1";
    const displayMessages: DisplayMessageType[] = [
      {
        type: "message",
        message: "我先读一下代码。",
        updateTime: 0,
      },
      {
        type: "tool",
        toolName: "readFile",
        params: {
          filePaths: ["/tmp/demo.ts"],
        } as any,
        updateTime: 30_000,
      },
      {
        type: "message",
        message: "已经确认根因。",
        updateTime: 60_000,
      },
      {
        type: "tool",
        toolName: "finishPhase",
        workflowPhase: "complete",
        params: {
          summary: "任务已完成",
          result: "最终交付内容",
        } as any,
        toolOutput: "任务已完成",
        updateTime: 120_000,
      },
    ];

    const { getByText, queryByText } = render(
      <WebSocketProvider
        url="ws://localhost:10013"
        autoConnect={false}
        initialState={{
          mainTaskId: taskId,
          tasks: {
            [taskId]: {
              rawMessages: [],
              displayMessages,
              status: "completed",
              lastUpdateTime: 120_000,
            },
          },
        }}
      >
        <ChatWindow taskId={taskId} />
      </WebSocketProvider>,
    );

    expect(getByText("我先读一下代码。")).toBeTruthy();
    expect(getByText("已经确认根因。")).toBeTruthy();
    expect(getByText("最终交付内容")).toBeTruthy();
    expect(queryByText("已处理2分钟")).toBeNull();
  });
});

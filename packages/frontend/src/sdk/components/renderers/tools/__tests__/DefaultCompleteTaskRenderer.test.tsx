import "../../../../provider/__tests__/setup";
import { describe, expect, it } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { DefaultCompleteTaskRenderer } from "../DefaultCompleteTaskRenderer";

describe("DefaultCompleteTaskRenderer", () => {
  it("renders result preview before the tool is confirmed", () => {
    const view = render(
      <DefaultCompleteTaskRenderer
        isLatest
        message={{
          type: "tool",
          updateTime: Date.now(),
          toolName: "completeTask",
          params: {
            summary: "完成了子任务",
            result: "## 交付内容\n\n这里是完整结果。",
          },
          workflowPhase: "design",
          partial: true,
        }}
      />,
    );

    fireEvent.click(view.getByRole("button"));

    expect(view.getByText("完成了子任务")).toBeTruthy();
    expect(view.getByText("这里是完整结果。")).toBeTruthy();
    expect(view.getByText("正在完成设计阶段")).toBeTruthy();
  });

  it("renders complete-stage content as plain text instead of an accordion", () => {
    const view = render(
      <DefaultCompleteTaskRenderer
        isLatest
        message={{
          type: "tool",
          updateTime: Date.now(),
          toolName: "completeTask",
          workflowPhase: "complete",
          params: {
            summary: "全部完成",
            result: "最终答复正文",
          },
          toolOutput: "任务已完成",
          partial: false,
        }}
      />,
    );

    expect(view.queryByRole("button")).toBeNull();
    expect(view.getByText("全部完成")).toBeTruthy();
    expect(view.getByText("最终答复正文")).toBeTruthy();
  });
});

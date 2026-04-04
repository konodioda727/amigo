import "../../../../provider/__tests__/setup";
import { describe, expect, it } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { DefaultCompletionResultRenderer } from "../DefaultCompletionResultRenderer";

describe("DefaultCompletionResultRenderer", () => {
  it("renders result preview before the tool is confirmed", () => {
    const view = render(
      <DefaultCompletionResultRenderer
        isLatest
        message={{
          type: "tool",
          updateTime: Date.now(),
          toolName: "completionResult",
          params: {
            summary: "本轮已经完成",
            result: "## 结果\n\n这里是主任务本轮总结。",
          },
          partial: true,
        }}
      />,
    );

    fireEvent.click(view.getByRole("button"));

    expect(view.getByText("本轮已经完成")).toBeTruthy();
    expect(view.getByText("这里是主任务本轮总结。")).toBeTruthy();
  });
});

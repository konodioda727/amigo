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
          partial: true,
        }}
      />,
    );

    fireEvent.click(view.getByRole("button"));

    expect(view.getByText("完成了子任务")).toBeTruthy();
    expect(view.getByText("这里是完整结果。")).toBeTruthy();
  });
});

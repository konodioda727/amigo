import "../../../../provider/__tests__/setup";
import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { DefaultRunChecksRenderer } from "../DefaultRunChecksRenderer";

describe("DefaultRunChecksRenderer", () => {
  it("renders each check step as a separate terminal-style block", () => {
    const view = render(
      <DefaultRunChecksRenderer
        message={{
          type: "tool",
          toolName: "runChecks",
          params: {
            commands: ["bun test", "bun run lint"],
          },
          toolOutput: {
            success: false,
            overallStatus: "partial",
            preset: "custom",
            workingDir: ".",
            failedSteps: ["custom_1_bun"],
            steps: [
              {
                name: "custom_1_bun",
                command: "bun test",
                status: "failed",
                exitCode: 1,
                durationMs: 120,
                outputTail: "1 test failed",
              },
              {
                name: "custom_2_bun",
                command: "bun run lint",
                status: "passed",
                exitCode: 0,
                durationMs: 80,
                outputTail: "Checked 2 files",
              },
            ],
            message: "runChecks 完成：2 个步骤，失败 1 个（custom_1_bun）",
          },
          updateTime: 1,
          hasError: false,
          partial: false,
        }}
        isLatest
      />,
    );

    expect(view.getByText("runChecks 完成：2 个步骤，失败 1 个（custom_1_bun）")).toBeTruthy();
    expect(view.getByText("未通过步骤: custom_1_bun")).toBeTruthy();
    expect(view.getByText("$ bun test")).toBeTruthy();
    expect(view.getByText("$ bun run lint")).toBeTruthy();
    expect(view.getByText("1 test failed")).toBeTruthy();
    expect(view.getByText("Checked 2 files")).toBeTruthy();
  });
});

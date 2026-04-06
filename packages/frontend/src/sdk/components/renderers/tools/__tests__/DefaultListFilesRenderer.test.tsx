import "../../../../provider/__tests__/setup";
import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { DefaultListFilesRenderer } from "../DefaultListFilesRenderer";

describe("DefaultListFilesRenderer", () => {
  it("renders the backend-provided tree output instead of raw JSON", () => {
    const view = render(
      <DefaultListFilesRenderer
        message={{
          type: "tool",
          toolName: "listFiles",
          params: {
            directoryPath: "src",
          },
          toolOutput: {
            success: true,
            directoryPath: "src",
            tree: ["src/", "├── components/", "└── index.ts"].join("\n"),
            entries: [],
            truncated: false,
            maxDepth: 2,
            includeHidden: false,
            maxEntries: 200,
            message: "已列出目录 src，共 2 项",
          },
          updateTime: 1,
          hasError: false,
          partial: false,
        }}
        isLatest
      />,
    );

    expect(view.getByText("已列出目录 src，共 2 项")).toBeTruthy();
    expect(view.getByText("深度 2 · 最多 200 项")).toBeTruthy();
    expect(view.getByText(/├── components\//)).toBeTruthy();
    expect(view.getByText(/└── index\.ts/)).toBeTruthy();
  });
});

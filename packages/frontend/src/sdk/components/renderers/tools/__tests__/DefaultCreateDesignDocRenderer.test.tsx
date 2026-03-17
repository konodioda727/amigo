import "../../../../provider/__tests__/setup";
import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { WebSocketProvider } from "../../../../provider/WebSocketProvider";
import { DefaultCreateDesignDocRenderer } from "../DefaultCreateDesignDocRenderer";

describe("DefaultCreateDesignDocRenderer", () => {
  it("surfaces validation failure immediately when a long-running design tool finishes", () => {
    const view = render(
      <WebSocketProvider autoConnect={false}>
        <DefaultCreateDesignDocRenderer
          isLatest
          message={{
            type: "tool",
            updateTime: Date.now(),
            toolName: "createDesignDocFromMarkup",
            params: {
              pageId: "home-page",
            },
            partial: true,
          }}
        />
      </WebSocketProvider>,
    );

    expect(view.queryByText("Schema 校验未通过")).toBeNull();

    view.rerender(
      <WebSocketProvider autoConnect={false}>
        <DefaultCreateDesignDocRenderer
          isLatest
          message={{
            type: "tool",
            updateTime: Date.now(),
            toolName: "createDesignDocFromMarkup",
            params: {
              pageId: "home-page",
            },
            partial: false,
            toolOutput: {
              success: false,
              validationErrors: ["sections.hero: 区块 nodes 不能为空"],
              message: "设计稿未通过 v3 schema 校验，共 1 个错误",
            },
          }}
        />
      </WebSocketProvider>,
    );

    expect(view.getByText("Schema 校验未通过")).toBeTruthy();
  });
});

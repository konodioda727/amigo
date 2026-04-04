import "../../../../provider/__tests__/setup";
import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { ToolAccordion } from "../ToolAccordion";

describe("ToolAccordion", () => {
  it("applies shimmer to the title while loading", () => {
    const view = render(
      <ToolAccordion title="执行中工具" isLoading>
        <div>内容</div>
      </ToolAccordion>,
    );

    const shimmerWrapper = view.getByText("执行中工具").closest(".loading-shimmer");
    expect(shimmerWrapper).toBeTruthy();
  });
});

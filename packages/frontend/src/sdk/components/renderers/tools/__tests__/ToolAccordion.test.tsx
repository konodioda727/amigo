import "../../../../provider/__tests__/setup";
import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { Settings } from "lucide-react";
import { ToolAccordion } from "../ToolAccordion";

describe("ToolAccordion", () => {
  it("applies shimmer to both icon and title while loading", () => {
    const view = render(
      <ToolAccordion icon={<Settings size={14} />} title="执行中工具" isLoading>
        <div>内容</div>
      </ToolAccordion>,
    );

    const shimmerWrapper = view.getByText("执行中工具").closest(".loading-shimmer");
    expect(shimmerWrapper).toBeTruthy();
  });
});

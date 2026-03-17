import "../../../provider/__tests__/setup";
import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { DefaultThinkRenderer } from "../DefaultThinkRenderer";
import { prepareStreamdownContent } from "../streamdownContent";

describe("DefaultThinkRenderer", () => {
  it("wraps design doc markup before handing content to Streamdown", () => {
    const content = [
      "准备创建设计稿：",
      '<page name="Landing Page" path="/">',
      '  <section id="hero" name="Hero" kind="hero"></section>',
      "</page>",
    ].join("\n");

    const transformed = prepareStreamdownContent(content);

    expect(transformed).toContain("```html");
    expect(transformed).toContain('<page name="Landing Page" path="/">');
    expect(transformed).toContain("</page>");
  });

  it("renders design doc markup as code instead of custom DOM tags", () => {
    const view = render(
      <DefaultThinkRenderer
        isLatest
        message={{
          type: "think",
          updateTime: Date.now(),
          think: [
            "准备创建设计稿：",
            '<page name="Landing Page" path="/">',
            '  <section id="hero" name="Hero" kind="hero"></section>',
            "</page>",
          ].join("\n"),
        }}
      />,
    );

    expect(view.container.querySelector("page")).toBeNull();
    expect(view.container.querySelector("section")).toBeNull();
    expect(view.container.textContent).toContain("准备创建设计稿：");
  });
});

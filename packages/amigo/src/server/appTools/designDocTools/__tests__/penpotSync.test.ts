import { describe, expect, it } from "bun:test";
import { validateExecutableDesignDoc } from "../designDocSchema";
import { convertPenpotFileToDesignDoc } from "../penpotSync";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

const createTextShape = (
  id: string,
  name: string,
  text: string,
  x: number,
  y: number,
  width = 240,
) => ({
  id,
  name,
  type: "text",
  x,
  y,
  width,
  height: 40,
  content: {
    type: "root",
    children: [
      {
        type: "paragraph-set",
        children: [
          {
            type: "paragraph",
            children: [
              {
                text,
                fills: [{ "fill-color": "#111827" }],
                "font-family": "sourcesanspro",
                "font-size": "24",
                "font-weight": "600",
              },
            ],
          },
        ],
      },
    ],
  },
  positionData: [
    {
      x,
      y,
      width,
      height: 40,
      x1: 0,
      y1: 0,
      x2: width,
      y2: 40,
      fontStyle: "normal",
      textTransform: "none",
      fontSize: "24px",
      fontWeight: "600",
      textDecoration: "none",
      letterSpacing: "normal",
      fills: [{ "fill-color": "#111827" }],
      direction: "ltr",
      fontFamily: "sourcesanspro",
      text,
    },
  ],
});

describe("convertPenpotFileToDesignDoc", () => {
  it("restores sections, buttons, and nested containers from Penpot objects", () => {
    const file = {
      id: "file-1",
      revn: 12,
      vern: 3,
      data: {
        pages: ["page-1"],
        pagesIndex: {
          "page-1": {
            id: "page-1",
            name: "Landing",
            background: "#FAF7F0",
            objects: {
              [ZERO_UUID]: {
                id: ZERO_UUID,
                shapes: ["section-hero"],
              },
              "section-hero": {
                id: "section-hero",
                name: "Hero",
                type: "frame",
                x: 0,
                y: 0,
                width: 1440,
                height: 560,
                fills: [{ "fill-color": "#F5F1E8", "fill-opacity": 1 }],
                shapes: ["hero-title", "hero-cta", "hero-cta-label", "hero-panel"],
              },
              "hero-title": createTextShape("hero-title", "Heading", "Amigo", 120, 120, 400),
              "hero-cta": {
                id: "hero-cta",
                name: "Primary CTA",
                type: "rect",
                x: 120,
                y: 260,
                width: 180,
                height: 52,
                fills: [{ "fill-color": "#111827", "fill-opacity": 1 }],
                r1: 12,
                r2: 12,
                r3: 12,
                r4: 12,
              },
              "hero-cta-label": createTextShape(
                "hero-cta-label",
                "Primary CTA Label",
                "Book now",
                136,
                272,
                132,
              ),
              "hero-panel": {
                id: "hero-panel",
                name: "Stats",
                type: "frame",
                x: 760,
                y: 120,
                width: 320,
                height: 180,
                fills: [{ "fill-color": "#FFFFFF", "fill-opacity": 1 }],
                shapes: ["hero-panel-text"],
              },
              "hero-panel-text": createTextShape("hero-panel-text", "Metric", "92%", 792, 156),
            },
          },
        },
      },
    };

    const document = convertPenpotFileToDesignDoc(file, "page-1");
    const validation = validateExecutableDesignDoc(document);

    expect(validation.valid).toBe(true);
    expect(document.page.name).toBe("Landing");
    expect(document.sections).toHaveLength(1);
    expect(document.sections[0]?.nodes.some((node) => node.type === "button")).toBe(true);
    expect(document.sections[0]?.nodes.some((node) => node.type === "container")).toBe(true);

    const button = document.sections[0]?.nodes.find((node) => node.type === "button");
    expect(button?.text).toBe("Book now");

    const container = document.sections[0]?.nodes.find((node) => node.type === "container");
    expect(container?.children?.[0]?.type).toBe("text");
    expect(container?.children?.[0]?.text).toBe("92%");
  });
});

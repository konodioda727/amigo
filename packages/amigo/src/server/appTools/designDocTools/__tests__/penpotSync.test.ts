import { describe, expect, it } from "bun:test";
import type { ExecutableDesignDoc } from "../designDocSchema";
import { buildReplacePageChanges, convertPenpotFileToDesignDoc } from "../penpotSync";
import { createStablePenpotUuid } from "../penpotSync/shared";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

const createTextShape = (
  id: string,
  name: string,
  text: string,
  x: number,
  y: number,
  width = 240,
  align: "left" | "center" | "right" = "left",
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
            "text-align": align,
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
      textAlign: align,
    },
  ],
});

describe("convertPenpotFileToDesignDoc", () => {
  it("emits stable Penpot ids and semantic tags during export", () => {
    const document = {
      page: {
        name: "Landing",
        width: 1440,
        minHeight: 560,
        background: "#FAF7F0",
      },
      designTokens: {
        colors: {
          background: "#FAF7F0",
          textPrimary: "#111827",
        },
        spacing: {},
        radius: {},
        typography: {
          body: {
            fontFamily: "sourcesanspro",
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 24,
          },
        },
      },
      sections: [
        {
          id: "hero-section",
          name: "Hero",
          kind: "hero",
          y: 0,
          height: 560,
          layout: {
            mode: "absolute",
          },
          nodes: [
            {
              id: "hero-title",
              name: "Hero Title",
              type: "text",
              text: "Amigo",
              x: 120,
              y: 120,
              width: 400,
              height: 40,
              style: {
                fontToken: "body",
                textColor: "#111827",
              },
            },
          ],
        },
      ],
    } as const;
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
                shapes: [],
              },
            },
          },
        },
      },
    };

    const firstChanges = buildReplacePageChanges(file, document, "page-1");
    const secondChanges = buildReplacePageChanges(file, document, "page-1");
    const firstAdds = firstChanges.changes.filter((change) => change.type === "add-obj");
    const secondAdds = secondChanges.changes.filter((change) => change.type === "add-obj");

    expect(firstAdds[0]?.id).toBe(secondAdds[0]?.id);
    expect(firstAdds[1]?.id).toBe(secondAdds[1]?.id);
    expect(firstAdds[0] && "obj" in firstAdds[0] ? firstAdds[0].obj?.name : "").toBe("Hero");
    expect(firstAdds[1] && "obj" in firstAdds[1] ? firstAdds[1].obj?.name : "").toBe("Hero Title");
    expect(firstChanges.anchors[firstAdds[0]?.id as string]?.semanticId).toBe("hero-section");
    expect(firstChanges.anchors[firstAdds[1]?.id as string]?.semanticId).toBe("hero-title");
  });

  it("maps explicit text widths to fixed growType and missing widths to auto-width", () => {
    const document = {
      page: {
        name: "Landing",
        width: 1440,
        minHeight: 560,
        background: "#FAF7F0",
      },
      designTokens: {
        colors: {
          background: "#FAF7F0",
          textPrimary: "#111827",
        },
        spacing: {},
        radius: {},
        typography: {
          body: {
            fontFamily: "sourcesanspro",
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 24,
          },
        },
      },
      sections: [
        {
          id: "hero-section",
          name: "Hero",
          kind: "hero",
          y: 0,
          height: 560,
          layout: {
            mode: "absolute",
          },
          nodes: [
            {
              id: "hero-title-fixed",
              name: "Hero Title Fixed",
              type: "text",
              text: "固定宽度标题",
              x: 120,
              y: 120,
              width: 320,
              height: 40,
              props: {
                textGrowType: "fixed",
              },
              style: {
                fontToken: "body",
                textColor: "#111827",
              },
            },
            {
              id: "hero-title-auto",
              name: "Hero Title Auto",
              type: "text",
              text: "自动宽度标题",
              x: 120,
              y: 180,
              width: 180,
              height: 40,
              props: {
                textGrowType: "auto-width",
              },
              style: {
                fontToken: "body",
                textColor: "#111827",
              },
            },
          ],
        },
      ],
    } as const;
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
                shapes: [],
              },
            },
          },
        },
      },
    };

    const textAdds = buildReplacePageChanges(file, document, "page-1").changes.filter(
      (change) => change.type === "add-obj" && change.obj && change.obj.type === "text",
    );

    expect(textAdds).toHaveLength(2);
    expect(textAdds[0]?.obj?.growType).toBe("fixed");
    expect(textAdds[1]?.obj?.growType).toBe("auto-width");
    expect(
      (
        (
          textAdds[1]?.obj?.content as {
            children?: Array<{ children?: Array<Record<string, unknown>> }>;
          }
        )?.children?.[0]?.children?.[0] as Record<string, unknown> | undefined
      )?.["letter-spacing"],
    ).toBeUndefined();
  });

  it("exports text letter-spacing into Penpot text payloads", () => {
    const document = {
      page: {
        name: "Landing",
        width: 1440,
        minHeight: 560,
        background: "#FAF7F0",
      },
      designTokens: {
        colors: {
          background: "#FAF7F0",
          textPrimary: "#111827",
        },
        spacing: {},
        radius: {},
        typography: {
          body: {
            fontFamily: "sourcesanspro",
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 24,
          },
        },
      },
      sections: [
        {
          id: "hero-section",
          name: "Hero",
          kind: "hero",
          y: 0,
          height: 560,
          layout: {
            mode: "absolute",
          },
          nodes: [
            {
              id: "hero-title",
              name: "Hero Title",
              type: "text",
              text: "TECH BLOG",
              x: 120,
              y: 120,
              width: 320,
              height: 40,
              props: {
                textGrowType: "fixed",
              },
              style: {
                fontToken: "body",
                textColor: "#111827",
                letterSpacing: 2,
              },
            },
          ],
        },
      ],
    } satisfies ExecutableDesignDoc;

    const file = {
      id: "file-1",
      revn: 1,
      vern: 1,
      data: {
        pages: ["page-1"],
        pagesIndex: {
          "page-1": {
            id: "page-1",
            name: "Page 1",
            background: "#FAF7F0",
            objects: {
              [ZERO_UUID]: {
                id: ZERO_UUID,
                shapes: [],
              },
            },
          },
        },
      },
    };

    const addObjs = buildReplacePageChanges(file, document, "page-1").changes.filter(
      (change) => change.type === "add-obj" && "obj" in change,
    ) as Array<{ id?: string; obj?: Record<string, unknown> }>;
    const title = addObjs.find((change) => change.obj?.name === "Hero Title");
    const textRun =
      ((
        title?.obj?.content as {
          children?: Array<{ children?: Array<{ children?: Array<Record<string, unknown>> }> }>;
        }
      )?.children?.[0]?.children?.[0]?.children?.[0] as Record<string, unknown> | undefined) || {};
    const positionData = ((
      title?.obj?.positionData as Array<Record<string, unknown>> | undefined
    )?.[0] || {}) as Record<string, unknown>;

    expect(textRun["letter-spacing"]).toBe("2");
    expect(positionData.letterSpacing).toBe("2px");
  });

  it("exports native shadows and background-image placeholders", () => {
    const document = {
      page: {
        name: "Landing",
        width: 1440,
        minHeight: 560,
        background: "#FAF7F0",
      },
      designTokens: {
        colors: {
          background: "#FAF7F0",
          surface: "#FFFFFF",
          textPrimary: "#111827",
        },
        spacing: {},
        radius: {},
        typography: {
          body: {
            fontFamily: "sourcesanspro",
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 24,
          },
        },
      },
      sections: [
        {
          id: "hero-section",
          name: "Hero",
          kind: "hero",
          y: 0,
          height: 560,
          layout: {
            mode: "absolute",
          },
          nodes: [
            {
              id: "hero-card",
              name: "Hero Card",
              type: "container",
              x: 120,
              y: 120,
              width: 720,
              height: 320,
              style: {
                fill: {
                  type: "image",
                  assetUrl: "https://picsum.photos/seed/hero/1200/800",
                },
                shadow: {
                  x: 0,
                  y: 24,
                  blur: 48,
                  color: "#0F172A",
                  opacity: 0.18,
                },
                radius: 24,
              },
              children: [
                {
                  id: "hero-title",
                  name: "Hero Title",
                  type: "text",
                  text: "Amigo",
                  x: 32,
                  y: 32,
                  width: 240,
                  height: 40,
                  style: {
                    textColor: "#111827",
                  },
                },
              ],
            },
          ],
        },
      ],
    } as const;

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
                shapes: [],
              },
            },
          },
        },
      },
    };

    const changes = buildReplacePageChanges(file, document, "page-1").changes.filter(
      (change) => change.type === "add-obj",
    ) as Array<{ id: string; obj: Record<string, unknown> }>;

    const imageShape = changes.find((change) => change.obj?.name === "Hero Card Image");
    const imageLabel = changes.find((change) => change.obj?.name === "Hero Card Image Label");
    const heroFrame = changes.find((change) => change.obj?.name === "Hero Card");

    expect(imageShape?.obj?.type).toBe("rect");
    expect(heroFrame?.obj?.type).toBe("frame");
    expect(heroFrame?.obj?.shadow).toEqual([
      {
        id: expect.any(String),
        style: "drop-shadow",
        offsetX: 0,
        offsetY: 24,
        blur: 48,
        spread: 0,
        hidden: false,
        color: {
          color: "#0F172A",
          opacity: 0.18,
        },
      },
    ]);
    expect(heroFrame?.obj?.shapes).toEqual(
      expect.arrayContaining([imageShape?.id, imageLabel?.id]),
    );
    expect(imageLabel?.obj?.type).toBe("text");
  });

  it("exports container background-image as native fillImage when media objects are available", () => {
    const document = {
      page: {
        name: "Landing",
        width: 1440,
        minHeight: 560,
        background: "#FAF7F0",
      },
      designTokens: {
        colors: {
          background: "#FAF7F0",
          surface: "#FFFFFF",
          textPrimary: "#111827",
        },
        spacing: {},
        radius: {},
        typography: {
          body: {
            fontFamily: "sourcesanspro",
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 24,
          },
        },
      },
      sections: [
        {
          id: "hero-section",
          name: "Hero",
          kind: "hero",
          y: 0,
          height: 560,
          layout: {
            mode: "absolute",
          },
          nodes: [
            {
              id: "hero-card",
              name: "Hero Card",
              type: "container",
              x: 120,
              y: 120,
              width: 720,
              height: 320,
              style: {
                fill: {
                  type: "image",
                  assetUrl: "https://picsum.photos/seed/hero-native/1200/800",
                },
                radius: 24,
              },
              children: [],
            },
          ],
        },
      ],
    } as const;

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
                shapes: [],
              },
            },
          },
        },
      },
    };

    const changes = buildReplacePageChanges(file, document, "page-1", {
      "https://picsum.photos/seed/hero-native/1200/800": {
        id: "media-bg-1",
        width: 1200,
        height: 800,
        mtype: "image/jpeg",
      },
    }).changes.filter((change) => change.type === "add-obj") as Array<{
      id: string;
      obj: Record<string, unknown>;
    }>;

    const heroFrame = changes.find((change) => change.obj?.name === "Hero Card");
    const imageLabel = changes.find((change) =>
      String(change.obj?.name || "").includes("Hero Card Image Label"),
    );

    expect(heroFrame?.obj?.type).toBe("frame");
    expect(heroFrame?.obj?.fills).toEqual([
      {
        fillOpacity: 1,
        fillImage: {
          id: "media-bg-1",
          width: 1200,
          height: 800,
          mtype: "image/jpeg",
          keepAspectRatio: true,
        },
      },
    ]);
    expect(imageLabel).toBeUndefined();
  });

  it("exports image nodes as native Penpot fillImage rects when media objects are available", () => {
    const document = {
      page: {
        name: "Landing",
        width: 1440,
        minHeight: 560,
        background: "#FAF7F0",
      },
      designTokens: {
        colors: {
          background: "#FAF7F0",
          surface: "#FFFFFF",
          textPrimary: "#111827",
        },
        spacing: {},
        radius: {},
        typography: {
          body: {
            fontFamily: "sourcesanspro",
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 24,
          },
        },
      },
      sections: [
        {
          id: "gallery-section",
          name: "Gallery",
          kind: "content",
          y: 0,
          height: 560,
          layout: {
            mode: "absolute",
          },
          nodes: [
            {
              id: "hero-image",
              name: "Hero Image",
              type: "image",
              x: 120,
              y: 120,
              width: 480,
              height: 320,
              assetUrl: "https://picsum.photos/seed/hero-image/1200/800",
              imageFit: "cover",
              style: {
                radius: 24,
              },
            },
          ],
        },
      ],
    } as const;

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
                shapes: [],
              },
            },
          },
        },
      },
    };

    const result = buildReplacePageChanges(file, document, "page-1", {
      "https://picsum.photos/seed/hero-image/1200/800": {
        id: "media-1",
        width: 1200,
        height: 800,
        mtype: "image/jpeg",
      },
    });
    const addObjs = result.changes.filter((change) => change.type === "add-obj") as Array<{
      id: string;
      obj: Record<string, unknown>;
    }>;
    const imageShape = addObjs.find((change) => change.obj?.name === "Hero Image");

    expect(imageShape?.obj?.type).toBe("rect");
    expect(imageShape?.obj?.fills).toEqual([
      {
        fillOpacity: 1,
        fillImage: {
          id: "media-1",
          width: 1200,
          height: 800,
          mtype: "image/jpeg",
          keepAspectRatio: true,
        },
      },
    ]);
    expect(result.anchors[imageShape?.id || ""]).toMatchObject({
      semanticId: "hero-image",
      nodeType: "image",
      assetUrl: "https://picsum.photos/seed/hero-image/1200/800",
      imageFit: "cover",
    });
  });

  it("restores rects with fillImage as image nodes during reverse import", () => {
    const file = {
      id: "file-1",
      revn: 1,
      vern: 1,
      data: {
        pages: ["page-1"],
        pagesIndex: {
          "page-1": {
            id: "page-1",
            name: "Gallery",
            background: "#FAF7F0",
            objects: {
              [ZERO_UUID]: {
                id: ZERO_UUID,
                shapes: ["section-1"],
              },
              "section-1": {
                id: "section-1",
                name: "Gallery",
                type: "frame",
                x: 0,
                y: 0,
                width: 1440,
                height: 560,
                shapes: ["image-1"],
              },
              "image-1": {
                id: "image-1",
                name: "Hero Image",
                type: "rect",
                x: 120,
                y: 120,
                width: 480,
                height: 320,
                fills: [
                  {
                    fillOpacity: 1,
                    fillImage: {
                      id: "media-1",
                      width: 1200,
                      height: 800,
                      mtype: "image/jpeg",
                      keepAspectRatio: true,
                    },
                  },
                ],
                strokes: [],
                r1: 24,
                r2: 24,
                r3: 24,
                r4: 24,
              },
            },
          },
        },
      },
    };

    const document = convertPenpotFileToDesignDoc(file, "page-1", null, {
      "section-1": {
        entityType: "section",
        semanticId: "gallery-section",
        displayName: "Gallery",
      },
      "image-1": {
        entityType: "node",
        semanticId: "hero-image",
        displayName: "Hero Image",
      },
    });
    const imageNode = document.sections[0]?.nodes[0];

    expect(imageNode?.type).toBe("image");
    expect(imageNode?.width).toBe(480);
    expect(imageNode?.height).toBe(320);
  });

  it("restores frame fillImage as container background-image during reverse import", () => {
    const file = {
      id: "file-1",
      revn: 1,
      vern: 1,
      data: {
        pages: ["page-1"],
        pagesIndex: {
          "page-1": {
            id: "page-1",
            name: "Gallery",
            background: "#FAF7F0",
            objects: {
              [ZERO_UUID]: {
                id: ZERO_UUID,
                shapes: ["section-1"],
              },
              "section-1": {
                id: "section-1",
                name: "Hero",
                type: "frame",
                x: 0,
                y: 0,
                width: 1440,
                height: 560,
                shapes: ["frame-1"],
              },
              "frame-1": {
                id: "frame-1",
                name: "Hero Card",
                type: "frame",
                x: 120,
                y: 120,
                width: 720,
                height: 320,
                fills: [
                  {
                    fillOpacity: 1,
                    fillImage: {
                      id: "media-bg-1",
                      width: 1200,
                      height: 800,
                      mtype: "image/jpeg",
                      keepAspectRatio: true,
                    },
                  },
                ],
                shapes: [],
                r1: 24,
                r2: 24,
                r3: 24,
                r4: 24,
              },
            },
          },
        },
      },
    };

    const existingDocument = {
      page: {
        name: "Gallery",
        width: 1440,
        minHeight: 560,
        background: "#FAF7F0",
      },
      designTokens: {
        colors: {
          background: "#FAF7F0",
        },
        spacing: {},
        radius: {},
        typography: {},
      },
      sections: [
        {
          id: "hero-section",
          name: "Hero",
          kind: "hero",
          x: 0,
          y: 0,
          width: 1440,
          height: 560,
          layout: { mode: "absolute" },
          nodes: [
            {
              id: "hero-card",
              name: "Hero Card",
              type: "container",
              x: 120,
              y: 120,
              width: 720,
              height: 320,
              style: {
                fill: {
                  type: "image",
                  assetUrl: "https://picsum.photos/seed/hero-native/1200/800",
                },
                radius: 24,
              },
            },
          ],
        },
      ],
    } as any;

    const document = convertPenpotFileToDesignDoc(file, "page-1", existingDocument, {
      "section-1": {
        entityType: "section",
        semanticId: "hero-section",
        displayName: "Hero",
      },
      "frame-1": {
        entityType: "node",
        semanticId: "hero-card",
        displayName: "Hero Card",
        assetUrl: "https://picsum.photos/seed/hero-native/1200/800",
      },
    });
    const node = document.sections[0]?.nodes[0];

    expect(node?.type).toBe("container");
    expect((node?.style as any)?.fill).toEqual({
      type: "image",
      assetUrl: "https://picsum.photos/seed/hero-native/1200/800",
    });
  });

  it("normalizes alpha hex fills and transparent text for Penpot payloads", () => {
    const document = {
      page: {
        name: "Alpha Colors",
        width: 1440,
        minHeight: 320,
        background: "#1E293B",
      },
      designTokens: {
        colors: {
          background: "#1E293B",
          textPrimary: "#FFFFFF",
        },
        spacing: {},
        radius: {},
        typography: {
          body: {
            fontFamily: "sourcesanspro",
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 24,
          },
        },
      },
      sections: [
        {
          id: "hero-section",
          name: "Hero",
          kind: "hero",
          y: 0,
          height: 320,
          layout: {
            mode: "absolute",
          },
          nodes: [
            {
              id: "alpha-box",
              name: "Alpha Box",
              type: "container",
              x: 120,
              y: 80,
              width: 320,
              height: 120,
              style: {
                fill: {
                  type: "solid",
                  color: "#8B5CF633",
                  opacity: 1,
                },
              },
              children: [
                {
                  id: "alpha-text",
                  name: "Alpha Text",
                  type: "text",
                  text: "Transparent",
                  x: 24,
                  y: 24,
                  width: 160,
                  height: 32,
                  style: {
                    textColor: "#00000000",
                  },
                },
              ],
            },
          ],
        },
      ],
    } as const;

    const file = {
      id: "file-1",
      revn: 12,
      vern: 3,
      data: {
        pages: ["page-1"],
        pagesIndex: {
          "page-1": {
            id: "page-1",
            name: "Alpha Colors",
            background: "#1E293B",
            objects: {
              [ZERO_UUID]: {
                id: ZERO_UUID,
                shapes: [],
              },
            },
          },
        },
      },
    };

    const addObjs = buildReplacePageChanges(file, document, "page-1").changes.filter(
      (change) => change.type === "add-obj" && "obj" in change,
    ) as Array<{ obj?: Record<string, unknown> }>;
    const alphaBox = addObjs.find((change) => change.obj?.name === "Alpha Box");
    const alphaText = addObjs.find((change) => change.obj?.name === "Alpha Text");

    const alphaBoxFill = ((alphaBox?.obj?.fills as Array<Record<string, unknown>> | undefined) ||
      [])[0];
    const alphaTextFill = (((
      alphaText?.obj?.content as {
        children?: Array<{ children?: Array<{ children?: Array<Record<string, unknown>> }> }>;
      }
    )?.children?.[0]?.children?.[0]?.children?.[0]?.fills as
      | Array<Record<string, unknown>>
      | undefined) || [])[0];

    expect(alphaBoxFill?.["fill-color"]).toBe("#8B5CF6");
    expect(Number(alphaBoxFill?.["fill-opacity"])).toBeCloseTo(0.2, 5);
    expect(alphaTextFill).toEqual({
      "fill-color": "#000000",
      "fill-opacity": 0,
    });
  });

  it("exports text alignment into Penpot text payloads", () => {
    const document = {
      page: {
        name: "Landing",
        width: 1440,
        minHeight: 560,
        background: "#FAF7F0",
      },
      designTokens: {
        colors: {
          background: "#FAF7F0",
          textPrimary: "#111827",
        },
        spacing: {},
        radius: {},
        typography: {
          body: {
            fontFamily: "sourcesanspro",
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 24,
          },
        },
      },
      sections: [
        {
          id: "hero-section",
          name: "Hero",
          kind: "hero",
          y: 0,
          height: 560,
          layout: {
            mode: "absolute",
          },
          nodes: [
            {
              id: "hero-title",
              name: "Hero Title",
              type: "text",
              text: "Centered",
              x: 120,
              y: 120,
              width: 600,
              height: 48,
              style: {
                fontToken: "body",
                textColor: "#111827",
                align: "center",
              },
            },
          ],
        },
      ],
    } as const;

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
                shapes: [],
              },
            },
          },
        },
      },
    };

    const textChange = buildReplacePageChanges(file, document, "page-1").changes.find(
      (change) => change.type === "add-obj" && "obj" in change && change.obj?.type === "text",
    ) as { obj?: Record<string, unknown> } | undefined;

    expect(
      (
        (
          textChange?.obj?.content as {
            children?: Array<{ children?: Array<Record<string, unknown>> }>;
          }
        )?.children?.[0]?.children?.[0] as Record<string, unknown> | undefined
      )?.["text-align"],
    ).toBe("center");
    expect(
      ((textChange?.obj?.positionData as Array<Record<string, unknown>> | undefined)?.[0] || {})[
        "textAlign"
      ],
    ).toBe("center");
  });

  it("exports buttons as frames with centered child labels", () => {
    const document = {
      page: {
        name: "Buttons",
        width: 1440,
        minHeight: 400,
        background: "#FFFFFF",
      },
      designTokens: {
        colors: {
          background: "#FFFFFF",
          textPrimary: "#111827",
          primary: "#2DD4BF",
        },
        spacing: {},
        radius: {},
        typography: {
          body: {
            fontFamily: "sourcesanspro",
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 24,
          },
        },
      },
      sections: [
        {
          id: "hero-section",
          name: "Hero",
          kind: "hero",
          y: 0,
          height: 400,
          layout: {
            mode: "absolute",
          },
          nodes: [
            {
              id: "button-11",
              name: "浏览全部文章",
              type: "button",
              text: "浏览全部文章",
              x: 606,
              y: 220,
              width: 227,
              height: 70,
              style: {
                fill: {
                  type: "solid",
                  color: "#2DD4BF",
                  opacity: 1,
                },
                radius: 999,
                textColor: "#FFFFFF",
                fontSize: 16,
                fontWeight: 500,
              },
              props: {
                cursor: "pointer",
              },
            },
          ],
        },
      ],
    } as const;

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
            background: "#FFFFFF",
            objects: {
              [ZERO_UUID]: {
                id: ZERO_UUID,
                shapes: [],
              },
            },
          },
        },
      },
    };

    const addObjs = buildReplacePageChanges(file, document, "page-1").changes.filter(
      (change) => change.type === "add-obj" && "obj" in change,
    ) as Array<{ id?: string; obj?: Record<string, unknown> }>;
    const buttonFrame = addObjs.find((change) => change.obj?.name === "浏览全部文章");
    const buttonLabel = addObjs.find((change) => change.obj?.name === "浏览全部文章 Label");

    expect(buttonFrame?.obj?.type).toBe("frame");
    expect(buttonFrame?.obj?.r1).toBe(999);
    expect(buttonFrame?.obj?.shapes).toEqual([buttonLabel?.id]);
    expect(buttonLabel?.obj?.type).toBe("text");
    expect(buttonLabel?.obj?.["parent-id"]).toBe(buttonFrame?.id);
    expect(buttonLabel?.obj?.["frame-id"]).toBe(buttonFrame?.id);
    expect(buttonLabel?.obj?.growType).toBe("auto-height");
    expect(
      (
        (
          buttonLabel?.obj?.content as {
            children?: Array<{ children?: Array<Record<string, unknown>> }>;
          }
        )?.children?.[0]?.children?.[0] as Record<string, unknown> | undefined
      )?.["text-align"],
    ).toBe("center");
    expect(
      ((buttonLabel?.obj?.positionData as Array<Record<string, unknown>> | undefined)?.[0] || {})[
        "textAlign"
      ],
    ).toBe("center");
  });

  it("exports section frames using section x and width instead of full page width", () => {
    const document = {
      page: {
        name: "Landing",
        width: 1440,
        minHeight: 400,
        background: "#FAF7F0",
      },
      designTokens: {
        colors: {
          background: "#FAF7F0",
          textPrimary: "#111827",
        },
        spacing: {},
        radius: {},
        typography: {
          body: {
            fontFamily: "sourcesanspro",
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 24,
          },
        },
      },
      sections: [
        {
          id: "header-section",
          name: "Header",
          kind: "header",
          x: 120,
          y: 0,
          width: 1200,
          height: 96,
          layout: {
            mode: "absolute",
          },
          nodes: [
            {
              id: "brand",
              name: "Brand",
              type: "text",
              text: "小森林博客",
              x: 32,
              y: 24,
              width: 120,
              height: 32,
              style: {
                fontToken: "body",
                textColor: "#111827",
              },
              props: {
                textGrowType: "fixed",
              },
            },
          ],
        },
      ],
    } as const;

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
                shapes: [],
              },
            },
          },
        },
      },
    };

    const addObjs = buildReplacePageChanges(file, document, "page-1").changes.filter(
      (change) => change.type === "add-obj" && "obj" in change,
    ) as Array<{ id?: string; obj?: Record<string, unknown> }>;
    const sectionFrame = addObjs.find((change) => change.obj?.name === "Header");

    expect(sectionFrame?.obj?.type).toBe("frame");
    expect(sectionFrame?.obj?.x).toBe(120);
    expect(sectionFrame?.obj?.width).toBe(1200);
  });

  it("requires semantic tags when restoring sections, buttons, and nested containers", () => {
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

    expect(() => convertPenpotFileToDesignDoc(file, "page-1")).toThrow(/Penpot 页面缺少语义标记/);
  });

  it("restores semantic ids from Penpot names", () => {
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
                shapes: ["penpot-section-uuid"],
              },
              "penpot-section-uuid": {
                id: "penpot-section-uuid",
                name: "[amigo type=section id=hero-section] Hero",
                type: "frame",
                x: 0,
                y: 0,
                width: 1440,
                height: 560,
                fills: [{ "fill-color": "#F5F1E8", "fill-opacity": 1 }],
                shapes: ["penpot-node-uuid"],
              },
              "penpot-node-uuid": createTextShape(
                "penpot-node-uuid",
                "[amigo type=node id=hero-title] Hero Title",
                "Amigo",
                120,
                120,
                400,
              ),
            },
          },
        },
      },
    };
    const existingDocument = {
      page: {
        name: "Landing",
        path: "/",
        width: 1440,
        minHeight: 560,
        background: "#FFFFFF",
      },
      designTokens: {
        colors: {
          background: "#FFFFFF",
          primary: "#2563EB",
          textPrimary: "#111827",
        },
        spacing: {
          lg: 24,
        },
        radius: {
          md: 16,
        },
        typography: {
          heading: {
            fontFamily: "Inter",
            fontSize: 48,
            fontWeight: 700,
            lineHeight: 56,
          },
        },
      },
      sections: [
        {
          id: "hero-section",
          name: "Hero",
          kind: "hero",
          y: 0,
          height: 560,
          layout: {
            mode: "absolute",
          },
          nodes: [],
        },
      ],
    };

    const document = convertPenpotFileToDesignDoc(file, "page-1", existingDocument);

    expect(document.sections[0]?.id).toBe("hero-section");
    expect(document.sections[0]?.kind).toBe("hero");
    expect(document.sections[0]?.nodes[0]?.id).toBe("hero-title");
    expect(document.sections[0]?.nodes[0]?.name).toBe("Hero Title");
    expect(document.designTokens.colors.background).toBe("#FAF7F0");
    expect(document.designTokens.typography.body?.fontFamily).toBe("sourcesanspro");
  });

  it("restores text alignment from Penpot text payloads", () => {
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
                shapes: ["penpot-section-uuid"],
              },
              "penpot-section-uuid": {
                id: "penpot-section-uuid",
                name: "[amigo type=section id=hero-section] Hero",
                type: "frame",
                x: 0,
                y: 0,
                width: 1440,
                height: 560,
                fills: [{ "fill-color": "#F5F1E8", "fill-opacity": 1 }],
                shapes: ["penpot-node-uuid"],
              },
              "penpot-node-uuid": createTextShape(
                "penpot-node-uuid",
                "[amigo type=node id=hero-title] Hero Title",
                "Amigo",
                120,
                120,
                400,
                "center",
              ),
            },
          },
        },
      },
    };

    const document = convertPenpotFileToDesignDoc(file, "page-1");

    expect(document.sections[0]?.nodes[0]?.style).toMatchObject({
      align: "center",
    });
  });

  it("fails fast when Penpot root sections are missing semantic tags", () => {
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
                shapes: ["penpot-section-uuid"],
              },
              "penpot-section-uuid": {
                id: "penpot-section-uuid",
                name: "Hero",
                type: "frame",
                x: 0,
                y: 0,
                width: 1440,
                height: 560,
                fills: [{ "fill-color": "#F5F1E8", "fill-opacity": 1 }],
                shapes: ["penpot-node-uuid"],
              },
              "penpot-node-uuid": createTextShape(
                "penpot-node-uuid",
                "Hero Title",
                "Amigo",
                120,
                120,
                400,
              ),
            },
          },
        },
      },
    };
    expect(() => convertPenpotFileToDesignDoc(file, "page-1")).toThrow(/Penpot 页面缺少语义标记/);
  });

  it("restores semantic ids from anchor map without visible name tags", () => {
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
                shapes: ["penpot-section-uuid"],
              },
              "penpot-section-uuid": {
                id: "penpot-section-uuid",
                name: "Hero",
                type: "frame",
                x: 0,
                y: 0,
                width: 1440,
                height: 560,
                fills: [{ "fill-color": "#F5F1E8", "fill-opacity": 1 }],
                shapes: ["penpot-node-uuid"],
              },
              "penpot-node-uuid": createTextShape(
                "penpot-node-uuid",
                "Hero Title",
                "Amigo",
                120,
                120,
                400,
              ),
            },
          },
        },
      },
    };

    const document = convertPenpotFileToDesignDoc(file, "page-1", null, {
      "penpot-section-uuid": {
        entityType: "section",
        semanticId: "hero-section",
        displayName: "Hero",
      },
      "penpot-node-uuid": {
        entityType: "node",
        semanticId: "hero-title",
        displayName: "Hero Title",
      },
    });

    expect(document.sections[0]?.id).toBe("hero-section");
    expect(document.sections[0]?.nodes[0]?.id).toBe("hero-title");
  });

  it("exports componentRef nodes as Penpot component instances when bindings exist", () => {
    const sourceParentSeed =
      "section:component-asset-blog-post-card/component-asset-blog-post-card-preview";
    const sourceInstanceNodeId = "component-asset-blog-post-card-instance";
    const sourceMainInstanceId = createStablePenpotUuid(
      `${sourceParentSeed}/${sourceInstanceNodeId}`,
    );
    const file = {
      id: "file-1",
      revn: 1,
      vern: 1,
      data: {
        pages: ["page-1"],
        pagesIndex: {
          "page-1": {
            id: "page-1",
            name: "Landing",
            background: "#FFFFFF",
            objects: {
              [ZERO_UUID]: {
                id: ZERO_UUID,
                shapes: [],
              },
            },
          },
        },
      },
    };

    const document: ExecutableDesignDoc = {
      page: {
        name: "Landing",
        width: 1440,
        minHeight: 400,
        background: "#FFFFFF",
      },
      designTokens: {
        colors: {
          background: "#FFFFFF",
          surface: "#FFFFFF",
          textPrimary: "#111827",
        },
        spacing: {},
        radius: {},
        typography: {
          body: {
            fontFamily: "sourcesanspro",
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 24,
          },
        },
      },
      sections: [
        {
          id: "hero-section",
          name: "Hero",
          kind: "hero",
          y: 0,
          height: 400,
          layout: {
            mode: "absolute",
          },
          nodes: [
            {
              id: "post-card-1",
              name: "Post Card",
              type: "container",
              x: 120,
              y: 80,
              width: 320,
              height: 200,
              layout: {
                mode: "absolute",
              },
              style: {
                fill: {
                  type: "solid",
                  color: "#FFFFFF",
                },
              },
              props: {
                componentRef: "blog/post-card",
                componentInstanceId: "post-card-1",
              },
              children: [
                {
                  id: "post-card-1--title",
                  name: "Title",
                  type: "text",
                  text: "Hello",
                  x: 24,
                  y: 24,
                  width: 240,
                  height: 32,
                  style: {
                    fontToken: "body",
                    textColor: "#111827",
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const changes = buildReplacePageChanges(file, document, "page-1", undefined, {
      "blog/post-card": {
        componentId: "component-post-card",
        fileId: "file-1",
        pageId: "page-assets-components",
        mainInstanceId: sourceMainInstanceId,
        sourceParentSeed,
        sourceInstanceNodeId,
        name: "文章卡片",
        path: "blog",
      },
    }).changes;

    const rootChange = changes.find(
      (change) =>
        change.type === "add-obj" &&
        change.id === createStablePenpotUuid("section:hero-section/post-card-1"),
    ) as { obj?: Record<string, unknown> } | undefined;
    const titleChange = changes.find(
      (change) =>
        change.type === "add-obj" &&
        change.id === createStablePenpotUuid("section:hero-section/post-card-1/post-card-1--title"),
    ) as { obj?: Record<string, unknown> } | undefined;

    expect(rootChange?.obj).toMatchObject({
      "component-id": "component-post-card",
      "component-file": "file-1",
      "component-root": true,
      "shape-ref": sourceMainInstanceId,
    });
    expect(titleChange?.obj).toMatchObject({
      "shape-ref": createStablePenpotUuid(
        "section:component-asset-blog-post-card/component-asset-blog-post-card-preview/component-asset-blog-post-card-instance/component-asset-blog-post-card-instance--title",
      ),
    });
  });
});

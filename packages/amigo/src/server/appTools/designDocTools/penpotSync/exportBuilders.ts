import { randomUUID } from "node:crypto";
import type { ExecutableDesignDoc } from "../designDocSchema";
import { getRootShapeIds, isPlainObject, sortNodesByZIndex } from "./shared";
import type { PenpotPositionData, PenpotRpcFile, PenpotTextStyle } from "./types";
import { ZERO_UUID } from "./types";

const toPenpotFill = (color: string, opacity = 1) => [
  {
    "fill-color": color,
    "fill-opacity": opacity,
  },
];

const toPenpotTextContent = (text: string, style: PenpotTextStyle) => ({
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
              fills: toPenpotFill(style.color),
              "font-family": style.fontFamily,
              "font-size": String(Math.round(style.fontSize)),
              "font-weight": String(Math.round(style.fontWeight)),
              "font-style": "normal",
            },
          ],
        },
      ],
    },
  ],
});

const buildTextStyle = (
  document: ExecutableDesignDoc,
  nodeStyle: Record<string, unknown> | undefined,
  fallbackTokenName: string,
): PenpotTextStyle => {
  const typography = document.designTokens.typography;
  const tokenName =
    typeof nodeStyle?.fontToken === "string" && typography[nodeStyle.fontToken]
      ? nodeStyle.fontToken
      : fallbackTokenName;
  const token = typography[tokenName];

  const textColor =
    typeof nodeStyle?.textColor === "string"
      ? nodeStyle.textColor
      : document.designTokens.colors.textPrimary ||
        document.designTokens.colors.primary ||
        "#111111";

  return {
    color: textColor,
    fontFamily: token?.fontFamily || "sourcesanspro",
    fontSize:
      typeof nodeStyle?.fontSize === "number" ? nodeStyle.fontSize : (token?.fontSize ?? 16),
    fontWeight:
      typeof nodeStyle?.fontWeight === "number" ? nodeStyle.fontWeight : (token?.fontWeight ?? 400),
  };
};

const createRectGeometry = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
  x1: x,
  y1: y,
  x2: x + width,
  y2: y + height,
});

const createPoints = (x: number, y: number, width: number, height: number) => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
];

const createIdentityMatrix = () => ({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
});

const createTextPositionData = (
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  style: PenpotTextStyle,
): PenpotPositionData[] => [
  {
    x,
    y,
    width,
    height,
    x1: 0,
    y1: 0,
    x2: width,
    y2: height,
    fontStyle: "normal",
    textTransform: "none",
    fontSize: `${Math.round(style.fontSize)}px`,
    fontWeight: String(Math.round(style.fontWeight)),
    textDecoration: "none",
    letterSpacing: "normal",
    fills: toPenpotFill(style.color),
    direction: "ltr",
    fontFamily: style.fontFamily,
    text,
  },
];

const createBaseShape = (
  id: string,
  name: string,
  type: "frame" | "rect" | "text",
  x: number,
  y: number,
  width: number,
  height: number,
  parentId: string,
  frameId: string,
  absoluteX = x,
  absoluteY = y,
) => ({
  id,
  name,
  type,
  x,
  y,
  width,
  height,
  rotation: 0,
  selrect: createRectGeometry(absoluteX, absoluteY, width, height),
  points: createPoints(absoluteX, absoluteY, width, height),
  transform: createIdentityMatrix(),
  "transform-inverse": createIdentityMatrix(),
  "parent-id": parentId,
  "frame-id": frameId,
});

const createFrameShape = (
  id: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  parentId: string,
  frameId: string,
  background?: string,
  absoluteX = x,
  absoluteY = y,
  shapes: string[] = [],
) => ({
  ...createBaseShape(
    id,
    name,
    "frame",
    absoluteX,
    absoluteY,
    width,
    height,
    parentId,
    frameId,
    absoluteX,
    absoluteY,
  ),
  type: "frame",
  fills: background ? toPenpotFill(background) : [],
  strokes: [],
  shapes,
  "hide-fill-on-export": false,
  "show-content": true,
  "proportion-lock": false,
  proportion: width / Math.max(height, 0.01),
  r1: 0,
  r2: 0,
  r3: 0,
  r4: 0,
});

const createRectShape = (
  id: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  parentId: string,
  frameId: string,
  background: string,
  radius = 0,
  absoluteX = x,
  absoluteY = y,
) => ({
  ...createBaseShape(
    id,
    name,
    "rect",
    absoluteX,
    absoluteY,
    width,
    height,
    parentId,
    frameId,
    absoluteX,
    absoluteY,
  ),
  type: "rect",
  fills: toPenpotFill(background),
  strokes: [],
  "proportion-lock": false,
  proportion: width / Math.max(height, 0.01),
  r1: radius,
  r2: radius,
  r3: radius,
  r4: radius,
});

const createTextShape = (
  id: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  parentId: string,
  frameId: string,
  text: string,
  style: PenpotTextStyle,
  absoluteX = x,
  absoluteY = y,
) => ({
  ...createBaseShape(
    id,
    name,
    "text",
    absoluteX,
    absoluteY,
    width,
    height,
    parentId,
    frameId,
    absoluteX,
    absoluteY,
  ),
  type: "text",
  hidden: false,
  content: toPenpotTextContent(text, style),
  positionData: createTextPositionData(text, absoluteX, absoluteY, width, height, style),
});

const appendNodeChanges = (
  document: ExecutableDesignDoc,
  node: ExecutableDesignDoc["sections"][number]["nodes"][number],
  pageId: string,
  frameId: string,
  parentId: string,
  parentAbsoluteX: number,
  parentAbsoluteY: number,
  changes: Record<string, unknown>[],
): string[] => {
  const nodeId = randomUUID();
  const style = isPlainObject(node.style) ? node.style : undefined;
  const absoluteX = parentAbsoluteX + node.x;
  const absoluteY = parentAbsoluteY + node.y;

  if (node.type === "container") {
    const background =
      typeof style?.fill === "object" &&
      style.fill &&
      !Array.isArray(style.fill) &&
      typeof style.fill.color === "string"
        ? style.fill.color
        : undefined;
    const childChanges: Record<string, unknown>[] = [];
    const childIds: string[] = [];

    for (const child of sortNodesByZIndex(node.children || [])) {
      childIds.push(
        ...appendNodeChanges(
          document,
          child,
          pageId,
          nodeId,
          nodeId,
          absoluteX,
          absoluteY,
          childChanges,
        ),
      );
    }

    changes.push({
      type: "add-obj",
      id: nodeId,
      "page-id": pageId,
      "frame-id": frameId,
      "parent-id": parentId,
      obj: createFrameShape(
        nodeId,
        node.name,
        node.x,
        node.y,
        node.width,
        node.height,
        parentId,
        frameId,
        background,
        absoluteX,
        absoluteY,
        childIds,
      ),
    });

    changes.push(...childChanges);
    return [nodeId];
  }

  if (node.type === "text") {
    const textStyle = buildTextStyle(document, style, "body");
    changes.push({
      type: "add-obj",
      id: nodeId,
      "page-id": pageId,
      "frame-id": frameId,
      "parent-id": parentId,
      obj: createTextShape(
        nodeId,
        node.name,
        node.x,
        node.y,
        node.width,
        node.height,
        parentId,
        frameId,
        node.text || node.name,
        textStyle,
        absoluteX,
        absoluteY,
      ),
    });
    return [nodeId];
  }

  if (node.type === "button") {
    const background =
      typeof style?.fill === "object" &&
      style.fill &&
      !Array.isArray(style.fill) &&
      typeof style.fill.color === "string"
        ? style.fill.color
        : document.designTokens.colors.primary || "#111111";
    const radius = typeof style?.radius === "number" ? style.radius : 12;

    changes.push({
      type: "add-obj",
      id: nodeId,
      "page-id": pageId,
      "frame-id": frameId,
      "parent-id": parentId,
      obj: createRectShape(
        nodeId,
        node.name,
        node.x,
        node.y,
        node.width,
        node.height,
        parentId,
        frameId,
        background,
        radius,
        absoluteX,
        absoluteY,
      ),
    });

    const textId = randomUUID();
    const textStyle = buildTextStyle(document, style, "body");
    changes.push({
      type: "add-obj",
      id: textId,
      "page-id": pageId,
      "frame-id": frameId,
      "parent-id": parentId,
      obj: createTextShape(
        textId,
        `${node.name} Label`,
        node.x + 16,
        node.y + Math.max(8, node.height / 2 - 12),
        Math.max(40, node.width - 32),
        Math.min(node.height - 16, 32),
        parentId,
        frameId,
        node.text || node.name,
        {
          ...textStyle,
          color:
            typeof style?.textColor === "string"
              ? style.textColor
              : document.designTokens.colors.background || "#FFFFFF",
        },
        absoluteX + 16,
        absoluteY + Math.max(8, node.height / 2 - 12),
      ),
    });
    return [nodeId, textId];
  }

  if (node.type === "image") {
    changes.push({
      type: "add-obj",
      id: nodeId,
      "page-id": pageId,
      "frame-id": frameId,
      "parent-id": parentId,
      obj: createRectShape(
        nodeId,
        node.name,
        node.x,
        node.y,
        node.width,
        node.height,
        parentId,
        frameId,
        document.designTokens.colors.surface || "#E5E7EB",
        16,
        absoluteX,
        absoluteY,
      ),
    });

    const labelId = randomUUID();
    changes.push({
      type: "add-obj",
      id: labelId,
      "page-id": pageId,
      "frame-id": frameId,
      "parent-id": parentId,
      obj: createTextShape(
        labelId,
        `${node.name} Placeholder`,
        node.x + 16,
        node.y + 16,
        Math.max(80, node.width - 32),
        28,
        parentId,
        frameId,
        node.assetUrl || node.name,
        {
          color: document.designTokens.colors.textSecondary || "#666666",
          fontFamily: "sourcesanspro",
          fontSize: 14,
          fontWeight: 400,
        },
        absoluteX + 16,
        absoluteY + 16,
      ),
    });
    return [nodeId, labelId];
  }

  const fallbackColor =
    typeof style?.fill === "object" &&
    style.fill &&
    !Array.isArray(style.fill) &&
    typeof style.fill.color === "string"
      ? style.fill.color
      : document.designTokens.colors.primary || "#111111";
  const shapeKind = node.shapeKind || "rect";
  const radius =
    shapeKind === "ellipse"
      ? Math.min(node.width, node.height) / 2
      : typeof style?.radius === "number"
        ? style.radius
        : 0;
  const width = shapeKind === "line" ? Math.max(node.width, 1) : node.width;
  const height = shapeKind === "line" ? Math.max(node.height, 1) : node.height;

  changes.push({
    type: "add-obj",
    id: nodeId,
    "page-id": pageId,
    "frame-id": frameId,
    "parent-id": parentId,
    obj: createRectShape(
      nodeId,
      node.name,
      node.x,
      node.y,
      width,
      height,
      parentId,
      frameId,
      fallbackColor,
      radius,
      absoluteX,
      absoluteY,
    ),
  });
  return [nodeId];
};

const buildPenpotChanges = (document: ExecutableDesignDoc, pageId: string) => {
  const changes: Record<string, unknown>[] = [
    {
      type: "mod-page",
      id: pageId,
      background: document.page.background,
      name: document.page.name,
    },
  ];

  for (const section of document.sections) {
    const sectionId = randomUUID();
    const sectionChanges: Record<string, unknown>[] = [];
    const sectionChildIds: string[] = [];

    for (const node of sortNodesByZIndex(section.nodes)) {
      sectionChildIds.push(
        ...appendNodeChanges(
          document,
          node,
          pageId,
          sectionId,
          sectionId,
          0,
          section.y,
          sectionChanges,
        ),
      );
    }

    changes.push({
      type: "add-obj",
      id: sectionId,
      "page-id": pageId,
      "frame-id": ZERO_UUID,
      obj: createFrameShape(
        sectionId,
        section.name,
        0,
        section.y,
        document.page.width,
        section.height,
        ZERO_UUID,
        ZERO_UUID,
        section.background,
        0,
        section.y,
        sectionChildIds,
      ),
    });
    changes.push(...sectionChanges);
  }

  return changes;
};

export const buildReplacePageChanges = (
  file: PenpotRpcFile,
  document: ExecutableDesignDoc,
  pageId: string,
) => {
  const deleteChanges = getRootShapeIds(file, pageId).map((shapeId) => ({
    type: "del-obj",
    id: shapeId,
    "page-id": pageId,
  }));

  return [...deleteChanges, ...buildPenpotChanges(document, pageId)];
};

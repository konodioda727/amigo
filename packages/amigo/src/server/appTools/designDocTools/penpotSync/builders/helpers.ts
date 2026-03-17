import type { ExecutableDesignDoc } from "../../designDocSchema";
import { createStablePenpotUuid } from "../shared";
import type {
  PenpotMediaObject,
  PenpotPositionData,
  PenpotRpcShadow,
  PenpotTextStyle,
} from "../types";
import type { ActiveComponentInstance } from "./types";

export type PenpotTextGrowType = "fixed" | "auto-width" | "auto-height";

const clampOpacity = (value: number) => Math.max(0, Math.min(1, value));

const expandShortHex = (value: string) =>
  value
    .slice(1)
    .split("")
    .map((char) => `${char}${char}`)
    .join("");

const normalizePenpotColor = (color: string, opacity = 1) => {
  const trimmed = color.trim();
  if (!trimmed) {
    return {
      color: "#000000",
      opacity: clampOpacity(opacity),
    };
  }

  if (trimmed.toLowerCase() === "transparent") {
    return {
      color: "#000000",
      opacity: 0,
    };
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return {
      color: `#${expandShortHex(trimmed).toUpperCase()}`,
      opacity: clampOpacity(opacity),
    };
  }

  if (/^#[0-9a-f]{4}$/i.test(trimmed)) {
    const expanded = expandShortHex(trimmed).toUpperCase();
    const alpha = parseInt(expanded.slice(6, 8), 16) / 255;
    return {
      color: `#${expanded.slice(0, 6)}`,
      opacity: clampOpacity(opacity * alpha),
    };
  }

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return {
      color: trimmed.toUpperCase(),
      opacity: clampOpacity(opacity),
    };
  }

  if (/^#[0-9a-f]{8}$/i.test(trimmed)) {
    const normalized = trimmed.toUpperCase();
    const alpha = parseInt(normalized.slice(7, 9), 16) / 255;
    return {
      color: normalized.slice(0, 7),
      opacity: clampOpacity(opacity * alpha),
    };
  }

  return {
    color: trimmed,
    opacity: clampOpacity(opacity),
  };
};

export const toPenpotFill = (color: string, opacity = 1) => {
  const normalized = normalizePenpotColor(color, opacity);
  return [
    {
      "fill-color": normalized.color,
      "fill-opacity": normalized.opacity,
    },
  ];
};

export const toPenpotImageFill = (image: PenpotMediaObject) => [
  {
    fillOpacity: 1,
    fillImage: {
      id: image.id,
      width: image.width,
      height: image.height,
      mtype: image.mtype,
      keepAspectRatio: true,
    },
  },
];

export const getSolidFillColor = (style: Record<string, unknown> | undefined) => {
  if (
    typeof style?.fill === "object" &&
    style.fill &&
    !Array.isArray(style.fill) &&
    style.fill.type === "solid" &&
    typeof style.fill.color === "string"
  ) {
    return style.fill.color;
  }

  if (Array.isArray(style?.fills)) {
    const fill = style.fills.find(
      (item) =>
        typeof item === "object" &&
        item &&
        !Array.isArray(item) &&
        item.type === "solid" &&
        typeof item.color === "string",
    ) as { color?: string } | undefined;
    if (typeof fill?.color === "string") {
      return fill.color;
    }
  }

  return undefined;
};

export const getImageFillUrl = (style: Record<string, unknown> | undefined) => {
  if (
    typeof style?.fill === "object" &&
    style.fill &&
    !Array.isArray(style.fill) &&
    style.fill.type === "image" &&
    typeof style.fill.assetUrl === "string"
  ) {
    return style.fill.assetUrl;
  }

  if (Array.isArray(style?.fills)) {
    const fill = style.fills.find(
      (item) =>
        typeof item === "object" &&
        item &&
        !Array.isArray(item) &&
        item.type === "image" &&
        typeof item.assetUrl === "string",
    ) as { assetUrl?: string } | undefined;
    if (typeof fill?.assetUrl === "string") {
      return fill.assetUrl;
    }
  }

  return undefined;
};

export const getShadowSpec = (style: Record<string, unknown> | undefined) => {
  if (
    typeof style?.shadow === "object" &&
    style.shadow &&
    !Array.isArray(style.shadow) &&
    typeof style.shadow.color === "string"
  ) {
    return {
      x: typeof style.shadow.x === "number" ? style.shadow.x : 0,
      y: typeof style.shadow.y === "number" ? style.shadow.y : 0,
      blur: typeof style.shadow.blur === "number" ? style.shadow.blur : 0,
      color: style.shadow.color,
      opacity: typeof style.shadow.opacity === "number" ? style.shadow.opacity : 0.18,
    };
  }

  return undefined;
};

export const toPenpotShadow = (
  seed: string,
  shadow: { x: number; y: number; blur: number; color: string; opacity?: number },
): PenpotRpcShadow[] => {
  const normalized = normalizePenpotColor(shadow.color, shadow.opacity ?? 0.18);
  return [
    {
      id: createStablePenpotUuid(`${seed}:shadow`),
      style: "drop-shadow",
      offsetX: shadow.x,
      offsetY: shadow.y,
      blur: shadow.blur,
      spread: 0,
      hidden: false,
      color: {
        color: normalized.color,
        opacity: normalized.opacity,
      },
    },
  ];
};

export const toPenpotTextContent = (text: string, style: PenpotTextStyle) => ({
  type: "root",
  children: [
    {
      type: "paragraph-set",
      children: [
        {
          type: "paragraph",
          ...(style.align ? { "text-align": style.align } : {}),
          children: [
            {
              text,
              fills: toPenpotFill(style.color),
              "font-family": style.fontFamily,
              "font-size": String(Math.round(style.fontSize)),
              "font-weight": String(Math.round(style.fontWeight)),
              "line-height": String(Math.round(style.lineHeight)),
              ...(typeof style.letterSpacing === "number"
                ? { "letter-spacing": String(style.letterSpacing) }
                : {}),
              "font-style": "normal",
            },
          ],
        },
      ],
    },
  ],
});

export const buildTextStyle = (
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
    lineHeight: token?.lineHeight ?? 24,
    letterSpacing:
      typeof nodeStyle?.letterSpacing === "number"
        ? nodeStyle.letterSpacing
        : typeof token?.letterSpacing === "number"
          ? token.letterSpacing
          : undefined,
    align: nodeStyle?.align === "center" || nodeStyle?.align === "right" ? nodeStyle.align : "left",
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
    lineHeight: `${Math.round(style.lineHeight)}px`,
    textDecoration: "none",
    letterSpacing: typeof style.letterSpacing === "number" ? `${style.letterSpacing}px` : "normal",
    fills: toPenpotFill(style.color),
    direction: "ltr",
    fontFamily: style.fontFamily,
    text,
    ...(style.align ? { textAlign: style.align } : {}),
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

const buildComponentInstanceAttrs = (
  activeComponentInstance: ActiveComponentInstance | undefined,
  sourceShapeId: string | null,
  isRoot = false,
) => {
  if (!sourceShapeId) {
    return {};
  }

  if (!activeComponentInstance) {
    return {
      "shape-ref": sourceShapeId,
    };
  }

  return isRoot
    ? {
        "component-id": activeComponentInstance.binding.componentId,
        "component-file": activeComponentInstance.binding.fileId,
        "component-root": true,
        "shape-ref": sourceShapeId,
      }
    : {
        "shape-ref": sourceShapeId,
      };
};

export const getCurrentComponentSourceShapeId = (
  activeComponentInstance: ActiveComponentInstance | undefined,
) =>
  activeComponentInstance
    ? createStablePenpotUuid(activeComponentInstance.currentSourceNodeSeed)
    : null;

export const getSyntheticComponentSourceShapeId = (
  activeComponentInstance: ActiveComponentInstance | undefined,
  suffix: string,
) =>
  activeComponentInstance
    ? createStablePenpotUuid(`${activeComponentInstance.currentSourceNodeSeed}:${suffix}`)
    : null;

export const applyComponentInstanceAttrs = <T extends Record<string, unknown>>(
  shape: T,
  activeComponentInstance: ActiveComponentInstance | undefined,
  sourceShapeId: string | null,
  isRoot = false,
) =>
  ({
    ...shape,
    ...buildComponentInstanceAttrs(activeComponentInstance, sourceShapeId, isRoot),
  }) as T;

export const createFrameShape = (
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
  radius = 0,
  shadow?: PenpotRpcShadow[],
  fillsOverride?: Array<Record<string, unknown>>,
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
  fills: fillsOverride || (background ? toPenpotFill(background) : []),
  strokes: [],
  ...(shadow && shadow.length > 0 ? { shadow } : {}),
  shapes,
  "hide-fill-on-export": false,
  "show-content": true,
  "proportion-lock": false,
  proportion: width / Math.max(height, 0.01),
  r1: radius,
  r2: radius,
  r3: radius,
  r4: radius,
});

export const createRectShape = (
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
  shadow?: PenpotRpcShadow[],
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
  ...(shadow && shadow.length > 0 ? { shadow } : {}),
  "proportion-lock": false,
  proportion: width / Math.max(height, 0.01),
  r1: radius,
  r2: radius,
  r3: radius,
  r4: radius,
});

export const createImageRectShape = (
  id: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  parentId: string,
  frameId: string,
  image: PenpotMediaObject,
  radius = 0,
  absoluteX = x,
  absoluteY = y,
  shadow?: PenpotRpcShadow[],
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
  fills: [
    {
      fillOpacity: 1,
      fillImage: {
        id: image.id,
        width: image.width,
        height: image.height,
        mtype: image.mtype,
        keepAspectRatio: true,
      },
    },
  ],
  strokes: [],
  ...(shadow && shadow.length > 0 ? { shadow } : {}),
  "proportion-lock": false,
  proportion: width / Math.max(height, 0.01),
  r1: radius,
  r2: radius,
  r3: radius,
  r4: radius,
});

export const createTextShape = (
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
  growType: PenpotTextGrowType = "fixed",
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
  growType,
  content: toPenpotTextContent(text, style),
  positionData: createTextPositionData(text, absoluteX, absoluteY, width, height, style),
});

export const appendImageFillPlaceholder = (
  changes: Array<Record<string, unknown>>,
  pageId: string,
  frameId: string,
  parentId: string,
  absoluteX: number,
  absoluteY: number,
  nodeSeed: string,
  nodeName: string,
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  radius: number,
  assetUrl: string,
  mediaObject?: PenpotMediaObject,
  imageRectSourceShapeId?: string | null,
  imageLabelSourceShapeId?: string | null,
) => {
  const imageRectId = createStablePenpotUuid(`${nodeSeed}:bg-image`);
  const imageLabelId = createStablePenpotUuid(`${nodeSeed}:bg-image-label`);

  changes.push({
    type: "add-obj",
    id: imageRectId,
    "page-id": pageId,
    "frame-id": frameId,
    "parent-id": parentId,
    obj: applyComponentInstanceAttrs(
      mediaObject
        ? createImageRectShape(
            imageRectId,
            `${nodeName} Image`,
            nodeX,
            nodeY,
            nodeWidth,
            nodeHeight,
            parentId,
            frameId,
            mediaObject,
            radius,
            absoluteX,
            absoluteY,
          )
        : createRectShape(
            imageRectId,
            `${nodeName} Image`,
            nodeX,
            nodeY,
            nodeWidth,
            nodeHeight,
            parentId,
            frameId,
            "#E5E7EB",
            radius,
            absoluteX,
            absoluteY,
          ),
      undefined,
      imageRectSourceShapeId || null,
    ),
  });
  changes.push({
    type: "add-obj",
    id: imageLabelId,
    "page-id": pageId,
    "frame-id": frameId,
    "parent-id": parentId,
    obj: applyComponentInstanceAttrs(
      createTextShape(
        imageLabelId,
        `${nodeName} Image Label`,
        nodeX + 16,
        nodeY + 16,
        Math.max(80, nodeWidth - 32),
        28,
        parentId,
        frameId,
        assetUrl,
        {
          color: "#666666",
          fontFamily: "sourcesanspro",
          fontSize: 14,
          fontWeight: 400,
          lineHeight: 20,
        },
        absoluteX + 16,
        absoluteY + 16,
      ),
      undefined,
      imageLabelSourceShapeId || null,
    ),
  });

  return [imageRectId, imageLabelId];
};

import { createHash } from "node:crypto";
import type {
  PenpotImportContext,
  PenpotRpcFile,
  PenpotRpcShape,
  PenpotSemanticAnchorMap,
} from "./types";
import { ZERO_UUID } from "./types";

const AMIGO_NAME_TAG_PATTERN = /^\[amigo type=(section|node) id=([^\]]+)\]\s*(.*)$/u;

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const toFiniteNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/px$/i, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

export const toPositiveNumber = (value: unknown, fallback = 1) =>
  Math.max(1, toFiniteNumber(value, fallback));

export const normalizeHexColor = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^[0-9a-f]{6}$/i.test(trimmed) || /^[0-9a-f]{8}$/i.test(trimmed)) {
    return `#${trimmed.toUpperCase()}`;
  }

  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return null;
};

export const inferLineHeight = (fontSize: number, rawValue?: unknown) => {
  const parsed = toFiniteNumber(rawValue, 0);
  if (parsed > 0) {
    return Math.max(1, Math.round(parsed));
  }
  return Math.max(1, Math.round(fontSize * 1.4));
};

export const extractFirstFill = (shape: PenpotRpcShape) => {
  const fill = Array.isArray(shape.fills) ? shape.fills.find((item) => item?.["fill-color"]) : null;
  if (!fill) {
    return undefined;
  }

  const color = normalizeHexColor(fill["fill-color"]);
  if (!color) {
    return undefined;
  }

  return {
    type: "solid" as const,
    color,
    opacity:
      typeof fill["fill-opacity"] === "number" && Number.isFinite(fill["fill-opacity"])
        ? Math.max(0, Math.min(1, fill["fill-opacity"]))
        : undefined,
  };
};

const extractImageFillRef = (shape: PenpotRpcShape) => {
  if (!Array.isArray(shape.fills)) {
    return null;
  }

  for (const fill of shape.fills) {
    if (!isPlainObject(fill)) {
      continue;
    }
    const imageFill = isPlainObject(fill.fillImage)
      ? fill.fillImage
      : isPlainObject(fill["fill-image"])
        ? fill["fill-image"]
        : null;
    if (imageFill) {
      return imageFill;
    }
  }

  return null;
};

const getExistingImageFillAssetUrl = (semanticId: string | null, context?: PenpotImportContext) => {
  if (!semanticId || !context) {
    return undefined;
  }

  const existingNode = context.existingNodes.get(semanticId);
  const style = existingNode?.style;
  if (
    style &&
    typeof style === "object" &&
    !Array.isArray(style) &&
    typeof (style as { fill?: unknown }).fill === "object" &&
    (style as { fill?: any }).fill?.type === "image" &&
    typeof (style as { fill?: any }).fill?.assetUrl === "string"
  ) {
    return (style as { fill?: any }).fill.assetUrl as string;
  }

  if (
    style &&
    typeof style === "object" &&
    !Array.isArray(style) &&
    Array.isArray((style as any).fills)
  ) {
    const imageFill = (style as any).fills.find(
      (fill: any) =>
        fill &&
        typeof fill === "object" &&
        fill.type === "image" &&
        typeof fill.assetUrl === "string",
    );
    if (imageFill?.assetUrl) {
      return imageFill.assetUrl as string;
    }
  }

  return undefined;
};

export const extractFirstStroke = (shape: PenpotRpcShape) => {
  const stroke = Array.isArray(shape.strokes)
    ? shape.strokes.find((item) => item?.["stroke-color"])
    : null;
  if (!stroke) {
    return undefined;
  }

  const color = normalizeHexColor(stroke["stroke-color"]);
  if (!color) {
    return undefined;
  }

  return {
    color,
    width: Math.max(0, toFiniteNumber(stroke["stroke-width"], 0)),
    opacity:
      typeof stroke["stroke-opacity"] === "number" && Number.isFinite(stroke["stroke-opacity"])
        ? Math.max(0, Math.min(1, stroke["stroke-opacity"]))
        : undefined,
  };
};

export const extractUniformRadius = (shape: PenpotRpcShape) => {
  const corners = [shape.r1, shape.r2, shape.r3, shape.r4]
    .map((item) => toFiniteNumber(item, 0))
    .filter((item) => item > 0);
  if (corners.length === 0) {
    return undefined;
  }

  const [first] = corners;
  return corners.every((item) => Math.abs(item - (first ?? 0)) < 0.01)
    ? first
    : Math.max(...corners);
};

export const extractFirstShadow = (shape: PenpotRpcShape) => {
  const shadow = Array.isArray(shape.shadow)
    ? shape.shadow.find((item) => item && item.style === "drop-shadow" && !item.hidden)
    : null;
  if (!shadow) {
    return undefined;
  }

  const color = normalizeHexColor(shadow.color?.color);
  if (!color) {
    return undefined;
  }

  return {
    x: toFiniteNumber(shadow.offsetX, 0),
    y: toFiniteNumber(shadow.offsetY, 0),
    blur: Math.max(0, toFiniteNumber(shadow.blur, 0)),
    color,
    opacity:
      typeof shadow.color?.opacity === "number" && Number.isFinite(shadow.color.opacity)
        ? Math.max(0, Math.min(1, shadow.color.opacity))
        : undefined,
  };
};

export const getRelativePosition = (shape: PenpotRpcShape, parentX: number, parentY: number) => ({
  x: toFiniteNumber(shape.x, 0) - parentX,
  y: toFiniteNumber(shape.y, 0) - parentY,
  width: toPositiveNumber(shape.width, 1),
  height: toPositiveNumber(shape.height, 1),
});

export const isTextInsideRect = (textShape: PenpotRpcShape, rectShape: PenpotRpcShape) => {
  const textX = toFiniteNumber(textShape.x, 0);
  const textY = toFiniteNumber(textShape.y, 0);
  const textRight = textX + toPositiveNumber(textShape.width, 1);
  const textBottom = textY + toPositiveNumber(textShape.height, 1);
  const rectX = toFiniteNumber(rectShape.x, 0);
  const rectY = toFiniteNumber(rectShape.y, 0);
  const rectRight = rectX + toPositiveNumber(rectShape.width, 1);
  const rectBottom = rectY + toPositiveNumber(rectShape.height, 1);

  return (
    textX >= rectX - 1 &&
    textY >= rectY - 1 &&
    textRight <= rectRight + 1 &&
    textBottom <= rectBottom + 1
  );
};

export const isValidUrlString = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

export const registerTypographyToken = (
  context: PenpotImportContext,
  style: {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
    letterSpacing?: number;
  },
) => {
  const key = [
    style.fontFamily,
    style.fontSize,
    style.fontWeight,
    style.lineHeight,
    style.letterSpacing ?? "",
  ].join("|");
  const existing = context.typographyIndex.get(key);
  if (existing) {
    return existing;
  }

  const tokenName =
    context.typographyIndex.size === 0 ? "body" : `type-${context.typographyIndex.size + 1}`;
  context.typographyIndex.set(key, tokenName);
  context.typography[tokenName] = {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    ...(style.letterSpacing !== undefined ? { letterSpacing: style.letterSpacing } : {}),
  };
  return tokenName;
};

export const buildNodeStyleFromShape = (
  shape: PenpotRpcShape,
  textStyle?:
    | {
        color: string;
        fontSize: number;
        fontWeight: number;
        align?: "left" | "center" | "right";
      }
    | undefined,
  context?: PenpotImportContext,
) => {
  const fill = extractFirstFill(shape);
  const imageFill = extractImageFillRef(shape);
  const stroke = extractFirstStroke(shape);
  const radius = extractUniformRadius(shape);
  const shadow = extractFirstShadow(shape);
  const style: Record<string, unknown> = {};
  const anchor = context ? getAnchorForShape(context.anchors, shape) : null;
  const semantic = parsePenpotSemanticName(shape.name);
  const imageAssetUrl =
    typeof anchor?.assetUrl === "string"
      ? anchor.assetUrl
      : getExistingImageFillAssetUrl(anchor?.semanticId || semantic?.semanticId || null, context);

  if (fill) {
    style.fill = fill;
    if (context && !context.colorHints.surface) {
      context.colorHints.surface = fill.color;
    }
  }
  if (imageFill && imageAssetUrl) {
    if (style.fill && typeof style.fill === "object" && !Array.isArray(style.fill)) {
      style.fills = [style.fill, { type: "image", assetUrl: imageAssetUrl }];
    }
    style.fill = {
      type: "image",
      assetUrl: imageAssetUrl,
    };
  }
  if (stroke) {
    style.stroke = stroke;
  }
  if (radius !== undefined) {
    style.radius = radius;
  }
  if (shadow) {
    style.shadow = shadow;
  }
  if (textStyle) {
    if (!context?.colorHints.textPrimary) {
      if (context) {
        context.colorHints.textPrimary = textStyle.color;
      }
    } else if (
      context &&
      context.colorHints.textPrimary !== textStyle.color &&
      !context.colorHints.textSecondary
    ) {
      context.colorHints.textSecondary = textStyle.color;
    }

    style.textColor = textStyle.color;
    style.fontSize = textStyle.fontSize;
    style.fontWeight = textStyle.fontWeight;
    if (textStyle.align) {
      style.align = textStyle.align;
    }
  }

  return Object.keys(style).length > 0 ? style : undefined;
};

export const getRootShapeIds = (file: PenpotRpcFile, pageId: string) => {
  const page = file.data?.pagesIndex?.[pageId];
  const root = page?.objects?.[ZERO_UUID];
  return Array.isArray(root?.shapes) ? root.shapes.filter(Boolean) : [];
};

export const sortNodesByZIndex = <
  T extends {
    zIndex?: number;
  },
>(
  nodes: T[],
) => [...nodes].sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0));

const formatUuidBytes = (bytes: Uint8Array) => {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
};

export const createStablePenpotUuid = (seed: string) => {
  const hash = createHash("sha1").update(seed).digest().subarray(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return formatUuidBytes(hash);
};

export const encodePenpotSemanticName = (
  entityType: "section" | "node",
  semanticId: string,
  displayName: string,
) => {
  const safeSemanticId = encodeURIComponent(semanticId.trim());
  const safeDisplayName = displayName.trim();
  return `[amigo type=${entityType} id=${safeSemanticId}]${safeDisplayName ? ` ${safeDisplayName}` : ""}`;
};

export const parsePenpotSemanticName = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(AMIGO_NAME_TAG_PATTERN);
  if (!match) {
    return null;
  }

  try {
    return {
      entityType: match[1] as "section" | "node",
      semanticId: decodeURIComponent(match[2] || ""),
      displayName: (match[3] || "").trim(),
    };
  } catch {
    return null;
  }
};

export const getPenpotDisplayName = (value: unknown, fallback: string) => {
  const semantic = parsePenpotSemanticName(value);
  if (semantic?.displayName) {
    return semantic.displayName;
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return fallback;
};

export const getAnchorForShape = (
  anchors: PenpotSemanticAnchorMap | undefined,
  shape: PenpotRpcShape,
) => {
  const shapeId = typeof shape.id === "string" ? shape.id : "";
  if (!shapeId || !anchors) {
    return null;
  }
  return anchors[shapeId] || null;
};

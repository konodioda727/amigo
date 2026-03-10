import type { PenpotImportContext, PenpotRpcFile, PenpotRpcShape } from "./types";
import { ZERO_UUID } from "./types";

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
      }
    | undefined,
  context?: PenpotImportContext,
) => {
  const fill = extractFirstFill(shape);
  const stroke = extractFirstStroke(shape);
  const radius = extractUniformRadius(shape);
  const style: Record<string, unknown> = {};

  if (fill) {
    style.fill = fill;
    if (context && !context.colorHints.surface) {
      context.colorHints.surface = fill.color;
    }
  }
  if (stroke) {
    style.stroke = stroke;
  }
  if (radius !== undefined) {
    style.radius = radius;
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

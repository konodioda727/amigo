import { DEFAULT_FONT_SIZE, DEFAULT_PAGE_MIN_HEIGHT, DEFAULT_PAGE_WIDTH } from "./constants";
import type { Insets, LengthValue, Margins, MarginValue } from "./types";

export const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

export const normalizeTextPreservingBreaks = (value: string) =>
  value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const toKebabCase = (value: string) =>
  value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

export const createInsets = (all = 0): Insets => ({
  top: all,
  right: all,
  bottom: all,
  left: all,
});

export const createMargins = (all: MarginValue = { kind: "px", value: 0 }): Margins => ({
  top: all,
  right: all,
  bottom: all,
  left: all,
});

export const parseNumber = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)(px|rem|em|vh|vw)?$/);
  if (!match) {
    return undefined;
  }

  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  const unit = match[2] || "";
  if (unit === "rem" || unit === "em") {
    return parsed * DEFAULT_FONT_SIZE;
  }
  if (unit === "vw") {
    return (parsed / 100) * DEFAULT_PAGE_WIDTH;
  }
  if (unit === "vh") {
    return (parsed / 100) * DEFAULT_PAGE_MIN_HEIGHT;
  }

  return parsed;
};

export const parseLength = (value: string | undefined): LengthValue | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "auto") {
    return undefined;
  }

  if (/^-?\d+(?:\.\d+)?%$/.test(trimmed)) {
    return { kind: "percent", value: Number.parseFloat(trimmed) };
  }

  if (/^-?\d+(?:\.\d+)?(?:px)?$/.test(trimmed)) {
    return { kind: "px", value: Number.parseFloat(trimmed) };
  }

  if (/^-?\d+(?:\.\d+)?(?:rem|em|vh|vw)$/.test(trimmed)) {
    const parsed = parseNumber(trimmed);
    return parsed === undefined ? undefined : { kind: "px", value: parsed };
  }

  return undefined;
};

export const parseAspectRatio = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }

  const fraction = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (fraction) {
    const left = Number(fraction[1]);
    const right = Number(fraction[2]);
    if (Number.isFinite(left) && Number.isFinite(right) && left > 0 && right > 0) {
      return left / right;
    }
    return undefined;
  }

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
};

export const parseMarginValue = (value: string | undefined): MarginValue | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed === "auto") {
    return "auto";
  }

  return parseLength(trimmed);
};

export const resolveLength = (value: LengthValue | undefined, parent: number, fallback: number) => {
  if (!value) {
    return fallback;
  }

  if (value.kind === "percent") {
    return (parent * value.value) / 100;
  }

  return value.value;
};

export const parseInsets = (value: string | undefined): Insets | undefined => {
  if (!value) {
    return undefined;
  }

  const parts = value
    .split(/\s+/)
    .map((part) => parseNumber(part))
    .filter((part): part is number => part !== undefined);

  if (parts.length === 0) {
    return undefined;
  }

  if (parts.length === 1) {
    return createInsets(parts[0]);
  }

  if (parts.length === 2) {
    return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  }

  if (parts.length === 3) {
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  }

  return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
};

export const parseMargins = (value: string | undefined): Margins | undefined => {
  if (!value) {
    return undefined;
  }

  const parts = value
    .split(/\s+/)
    .map((part) => parseMarginValue(part))
    .filter((part): part is MarginValue => part !== undefined);

  if (parts.length === 0) {
    return undefined;
  }

  if (parts.length === 1) {
    return createMargins(parts[0]);
  }

  if (parts.length === 2) {
    return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  }

  if (parts.length === 3) {
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  }

  return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
};

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const NAMED_COLORS: Record<string, string> = {
  aliceblue: "#F0F8FF",
  antiquewhite: "#FAEBD7",
  aqua: "#00FFFF",
  aquamarine: "#7FFFD4",
  azure: "#F0FFFF",
  beige: "#F5F5DC",
  bisque: "#FFE4C4",
  black: "#000000",
  blanchedalmond: "#FFEBCD",
  blue: "#0000FF",
  brown: "#A52A2A",
  coral: "#FF7F50",
  crimson: "#DC143C",
  cyan: "#00FFFF",
  gold: "#FFD700",
  gray: "#808080",
  green: "#008000",
  grey: "#808080",
  indigo: "#4B0082",
  ivory: "#FFFFF0",
  khaki: "#F0E68C",
  lavender: "#E6E6FA",
  lime: "#00FF00",
  magenta: "#FF00FF",
  maroon: "#800000",
  navy: "#000080",
  olive: "#808000",
  orange: "#FFA500",
  orchid: "#DA70D6",
  pink: "#FFC0CB",
  plum: "#DDA0DD",
  purple: "#800080",
  red: "#FF0000",
  salmon: "#FA8072",
  silver: "#C0C0C0",
  skyblue: "#87CEEB",
  teal: "#008080",
  tomato: "#FF6347",
  transparent: "#00000000",
  violet: "#EE82EE",
  white: "#FFFFFF",
  whitesmoke: "#F5F5F5",
  yellow: "#FFFF00",
};

export const normalizeHexColor = (value: string): string | undefined => {
  const trimmed = value.trim();
  const namedColor = NAMED_COLORS[trimmed.toLowerCase()];
  if (namedColor) {
    return namedColor;
  }
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) {
    if (trimmed.length === 4) {
      const [, r, g, b] = trimmed;
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    return trimmed.toUpperCase();
  }

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?\s*\)$/i,
  );
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return `#${clampByte(Number(r)).toString(16).padStart(2, "0")}${clampByte(Number(g))
      .toString(16)
      .padStart(2, "0")}${clampByte(Number(b)).toString(16).padStart(2, "0")}`.toUpperCase();
  }

  const gradientColors = trimmed.match(/#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})/gi);
  if (gradientColors && gradientColors.length > 0) {
    return normalizeHexColor(gradientColors[gradientColors.length - 1] || "");
  }

  return undefined;
};

export const parseBorder = (value: string | undefined) => {
  if (!value || value.trim().toLowerCase() === "none") {
    return {};
  }

  const parts = value.split(/\s+/).filter(Boolean);
  let borderWidth: number | undefined;
  let borderColor: string | undefined;
  for (const part of parts) {
    if (borderWidth === undefined) {
      borderWidth = parseNumber(part);
      if (borderWidth !== undefined) {
        continue;
      }
    }
    if (!borderColor) {
      borderColor = normalizeHexColor(part);
    }
  }

  return { borderWidth, borderColor };
};

export const parseColorWithOpacity = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  const rgbaMatch = trimmed.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?\s*\)$/i,
  );
  if (rgbaMatch) {
    const [, r, g, b, alpha] = rgbaMatch;
    const color = `#${clampByte(Number(r)).toString(16).padStart(2, "0")}${clampByte(Number(g))
      .toString(16)
      .padStart(2, "0")}${clampByte(Number(b)).toString(16).padStart(2, "0")}`.toUpperCase();

    const opacity =
      typeof alpha === "string" && alpha.trim()
        ? Math.max(0, Math.min(1, Number.parseFloat(alpha)))
        : undefined;

    return { color, opacity: Number.isFinite(opacity as number) ? opacity : undefined };
  }

  const hex = normalizeHexColor(trimmed);
  if (hex) {
    return { color: hex, opacity: undefined as number | undefined };
  }

  return undefined;
};

export const parseCssUrl = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  const match = value.trim().match(/^url\((.*)\)$/i);
  if (!match) {
    return undefined;
  }

  const raw = (match[1] || "").trim().replace(/^['"]|['"]$/g, "");
  return raw || undefined;
};

const splitTopLevelCommaValues = (value: string) => {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")" && depth > 0) {
      depth -= 1;
    }

    if (char === "," && depth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
};

export const parseBoxShadow = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  const firstShadow = splitTopLevelCommaValues(value)[0];
  if (!firstShadow) {
    return undefined;
  }

  const colorMatch = firstShadow.match(
    /(rgba?\([^)]*\)|#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8}))/,
  );
  const colorToken = colorMatch?.[1];
  const color = parseColorWithOpacity(colorToken);
  const shadowBody = firstShadow
    .replace(/\binset\b/gi, "")
    .replace(colorToken || "", "")
    .trim();
  const lengths = shadowBody
    .split(/\s+/)
    .map((part) => parseNumber(part))
    .filter((part): part is number => part !== undefined);

  if (lengths.length < 2 || !color) {
    return undefined;
  }

  return {
    x: lengths[0] || 0,
    y: lengths[1] || 0,
    blur: Math.max(0, lengths[2] || 0),
    color: color.color,
    ...(color.opacity !== undefined ? { opacity: color.opacity } : {}),
  };
};

export const appendStyleDeclaration = (base: string | undefined, addition: string | undefined) =>
  [base?.trim().replace(/;$/, ""), addition?.trim().replace(/;$/, "")].filter(Boolean).join(";");

export const chunkArray = <T>(items: T[], size: number) => {
  if (size <= 0) {
    return [items];
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

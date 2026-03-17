import * as csstree from "css-tree";
import {
  COMMON_ALLOWED_ATTRIBUTES,
  isStateStyleProperty,
  isVendorStyleProperty,
  PRESENTATIONAL_STYLE_KEYS,
  SUPPORTED_STYLE_PROPERTIES,
  TAG_ALLOWED_ATTRIBUTES,
} from "./constants";
import type { ComputedStyle, GridTrack, MarkupElement } from "./types";
import {
  createMargins,
  normalizeHexColor,
  parseAspectRatio,
  parseBorder,
  parseBoxShadow,
  parseColorWithOpacity,
  parseCssUrl,
  parseInsets,
  parseLength,
  parseMargins,
  parseMarginValue,
  parseNumber,
} from "./utils";

const generateValue = (valueNode: csstree.CssNode) => csstree.generate(valueNode).trim();

const parseGridColumnCount = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  const repeatMatch = trimmed.match(/^repeat\(\s*(\d+)\s*,/);
  if (repeatMatch) {
    return Number.parseInt(repeatMatch[1] || "0", 10) || undefined;
  }

  const compact = trimmed.replace(/minmax\([^)]*\)/g, "minmax");
  const tokens = compact.split(/\s+/).filter(Boolean);
  return tokens.length > 1 ? tokens.length : undefined;
};

const splitGridTemplateTokens = (value: string) => {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value.trim()) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (/\s/.test(char) && depth === 0) {
      if (current.trim()) {
        tokens.push(current.trim());
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
};

const parseGridTracks = (value: string): GridTrack[] | undefined => {
  const normalized = value
    .trim()
    .replace(/minmax\(\s*0(?:px|rem|em|vh|vw|%)?\s*,\s*([^)]+)\)/gi, "$1");
  const repeatMatch = normalized.match(/^repeat\(\s*(\d+)\s*,\s*([^)]+)\)$/i);
  const repeated =
    repeatMatch && repeatMatch[1] && repeatMatch[2]
      ? Array.from({ length: Number.parseInt(repeatMatch[1], 10) || 0 }, () => repeatMatch[2] || "")
      : splitGridTemplateTokens(normalized);

  const tracks = repeated
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token): GridTrack | undefined => {
      const frMatch = token.match(/^(-?\d*(?:\.\d+)?)fr$/i);
      if (frMatch) {
        const value = frMatch[1] ? Number.parseFloat(frMatch[1]) : 1;
        return Number.isFinite(value) && value > 0 ? { kind: "fr", value } : undefined;
      }

      const length = parseLength(token);
      return length ? { kind: "length", value: length } : undefined;
    });

  return tracks.length > 0 && tracks.every(Boolean) ? (tracks as GridTrack[]) : undefined;
};

export const validateStyleDeclarations = (declarationText: string): string[] => {
  if (!declarationText.trim()) {
    return [];
  }

  try {
    const ast = csstree.parse(declarationText, { context: "declarationList" });
    const errors: string[] = [];

    csstree.walk(ast, {
      visit: "Declaration",
      enter(node) {
        if (node.type !== "Declaration") {
          return;
        }

        const property = node.property.trim().toLowerCase();
        if (
          !SUPPORTED_STYLE_PROPERTIES.has(property) &&
          !isStateStyleProperty(property) &&
          !isVendorStyleProperty(property)
        ) {
          errors.push(`不支持的样式属性: ${property}`);
        }
      },
    });

    return errors;
  } catch (error) {
    return [`样式语法无效: ${error instanceof Error ? error.message : String(error)}`];
  }
};

export const buildDeclarationText = (attributes: Record<string, string>) => {
  const declarations: string[] = [];
  const inlineStyle = attributes.style?.trim();
  if (inlineStyle) {
    declarations.push(inlineStyle.replace(/;$/, ""));
  }

  for (const key of PRESENTATIONAL_STYLE_KEYS) {
    const value = attributes[key];
    if (typeof value === "string" && value.trim()) {
      if (["border-top", "border-right", "border-bottom", "border-left"].includes(key)) {
        declarations.push(`border:${value.trim()}`);
      } else {
        declarations.push(`${key}:${value.trim()}`);
      }
    }
  }

  for (const [key, value] of Object.entries(attributes)) {
    if (!isVendorStyleProperty(key)) {
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      declarations.push(`${key}:${value.trim()}`);
    }
  }

  return declarations.join(";");
};

export const validateAttributes = (element: MarkupElement): string[] => {
  const errors: string[] = [];
  const allowed = TAG_ALLOWED_ATTRIBUTES[element.tagName];

  for (const key of Object.keys(element.attributes)) {
    const isStateAttribute = isStateStyleProperty(key);
    if (
      COMMON_ALLOWED_ATTRIBUTES.has(key) ||
      allowed.has(key) ||
      PRESENTATIONAL_STYLE_KEYS.includes(key) ||
      isStateAttribute ||
      isVendorStyleProperty(key) ||
      key.startsWith("data-")
    ) {
      continue;
    }

    errors.push(`<${element.tagName}> 不支持的属性: ${key}`);
  }

  errors.push(...validateStyleDeclarations(buildDeclarationText(element.attributes)));
  for (const child of element.children) {
    errors.push(...validateAttributes(child));
  }
  return errors;
};

export const computeStyle = (attributes: Record<string, string>): ComputedStyle => {
  const style: ComputedStyle = {};
  const declarationText = buildDeclarationText(attributes);
  if (!declarationText) {
    return style;
  }

  const ast = csstree.parse(declarationText, { context: "declarationList" });
  csstree.walk(ast, {
    visit: "Declaration",
    enter(node) {
      if (node.type !== "Declaration") {
        return;
      }

      const property = node.property.trim().toLowerCase();
      const rawValue = generateValue(node.value);
      switch (property) {
        case "width":
          style.width = parseLength(rawValue);
          break;
        case "aspect-ratio":
          style.aspectRatio = parseAspectRatio(rawValue);
          break;
        case "min-width":
          style.minWidth = parseLength(rawValue);
          break;
        case "height":
          style.height = parseLength(rawValue);
          break;
        case "min-height":
          style.minHeight = parseLength(rawValue);
          break;
        case "max-height":
          style.maxHeight = parseLength(rawValue);
          break;
        case "max-width":
          style.maxWidth = parseLength(rawValue);
          break;
        case "top":
          style.top = parseLength(rawValue);
          break;
        case "right":
          style.right = parseLength(rawValue);
          break;
        case "bottom":
          style.bottom = parseLength(rawValue);
          break;
        case "left":
          style.left = parseLength(rawValue);
          break;
        case "padding":
          style.padding = parseInsets(rawValue);
          break;
        case "padding-top":
          style.padding = {
            ...(style.padding || { top: 0, right: 0, bottom: 0, left: 0 }),
            top: parseNumber(rawValue) || 0,
          };
          break;
        case "padding-right":
          style.padding = {
            ...(style.padding || { top: 0, right: 0, bottom: 0, left: 0 }),
            right: parseNumber(rawValue) || 0,
          };
          break;
        case "padding-bottom":
          style.padding = {
            ...(style.padding || { top: 0, right: 0, bottom: 0, left: 0 }),
            bottom: parseNumber(rawValue) || 0,
          };
          break;
        case "padding-left":
          style.padding = {
            ...(style.padding || { top: 0, right: 0, bottom: 0, left: 0 }),
            left: parseNumber(rawValue) || 0,
          };
          break;
        case "gap":
          style.gap = parseNumber(rawValue);
          break;
        case "row-gap":
          style.rowGap = parseNumber(rawValue);
          break;
        case "column-gap":
          style.columnGap = parseNumber(rawValue);
          break;
        case "display":
          style.display = rawValue.toLowerCase();
          break;
        case "position":
          style.position = rawValue.toLowerCase() === "absolute" ? "absolute" : "relative";
          break;
        case "flex-direction":
          style.flexDirection = rawValue.toLowerCase() === "column" ? "column" : "row";
          break;
        case "flex":
          style.flex = parseNumber(rawValue);
          break;
        case "flex-grow":
          style.flexGrow = parseNumber(rawValue);
          break;
        case "flex-shrink":
          style.flexShrink = parseNumber(rawValue);
          break;
        case "flex-basis":
          style.flexBasis =
            rawValue.trim().toLowerCase() === "auto" ? "auto" : parseLength(rawValue);
          break;
        case "flex-wrap":
          style.flexWrap = rawValue.toLowerCase() === "wrap" ? "wrap" : "nowrap";
          break;
        case "justify-content":
          style.justifyContent = rawValue.toLowerCase();
          break;
        case "align-items":
          style.alignItems = rawValue.toLowerCase();
          break;
        case "margin":
          style.margin = parseMargins(rawValue);
          break;
        case "margin-top":
          style.margin = {
            ...(style.margin || createMargins()),
            top: parseMarginValue(rawValue) || { kind: "px", value: 0 },
          };
          break;
        case "margin-right":
          style.margin = {
            ...(style.margin || createMargins()),
            right: parseMarginValue(rawValue) || { kind: "px", value: 0 },
          };
          break;
        case "margin-bottom":
          style.margin = {
            ...(style.margin || createMargins()),
            bottom: parseMarginValue(rawValue) || { kind: "px", value: 0 },
          };
          break;
        case "margin-left":
          style.margin = {
            ...(style.margin || createMargins()),
            left: parseMarginValue(rawValue) || { kind: "px", value: 0 },
          };
          break;
        case "background":
        case "background-color": {
          const parsedColor = parseColorWithOpacity(rawValue);
          style.backgroundColor = parsedColor?.color ?? normalizeHexColor(rawValue);
          if (parsedColor?.opacity !== undefined) {
            style.backgroundOpacity = parsedColor.opacity;
          }
          break;
        }
        case "background-image":
          style.backgroundImageUrl = parseCssUrl(rawValue);
          break;
        case "background-size":
          style.backgroundSize = rawValue;
          break;
        case "background-position":
          style.backgroundPosition = rawValue;
          break;
        case "color":
          style.color = normalizeHexColor(rawValue);
          break;
        case "border-radius":
          style.borderRadius = parseNumber(rawValue);
          break;
        case "border":
        case "outline":
        case "border-top":
        case "border-right":
        case "border-bottom":
        case "border-left": {
          const border = parseBorder(rawValue);
          if (property === "outline") {
            style.outline = rawValue;
            if (style.borderWidth === undefined) {
              style.borderWidth = border.borderWidth;
            }
            if (style.borderColor === undefined) {
              style.borderColor = border.borderColor;
            }
          } else {
            style.borderWidth = border.borderWidth;
            style.borderColor = border.borderColor;
          }
          break;
        }
        case "font-size":
          style.fontSize = parseNumber(rawValue);
          break;
        case "font-weight":
          style.fontWeight = parseNumber(rawValue);
          break;
        case "font-style":
          style.fontStyle = rawValue.toLowerCase() === "italic" ? "italic" : "normal";
          break;
        case "font-family":
          style.fontFamily = rawValue
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
            .join(", ");
          break;
        case "letter-spacing":
          style.letterSpacing = parseNumber(rawValue);
          break;
        case "line-height":
          style.lineHeight = parseNumber(rawValue);
          break;
        case "text-align":
          style.textAlign = rawValue === "center" || rawValue === "right" ? rawValue : "left";
          break;
        case "white-space":
          style.whiteSpace = rawValue;
          break;
        case "text-overflow":
          style.textOverflow = rawValue;
          break;
        case "list-style":
          style.listStyle = rawValue;
          break;
        case "text-decoration":
          style.textDecoration = rawValue;
          break;
        case "opacity":
          style.opacity = parseNumber(rawValue);
          break;
        case "cursor":
          style.cursor = rawValue;
          break;
        case "filter":
          style.filter = rawValue;
          break;
        case "transform":
          style.transform = rawValue;
          break;
        case "transition":
          style.transition = rawValue;
          break;
        case "animation":
          style.animation = rawValue;
          break;
        case "overflow":
          style.overflow = rawValue;
          break;
        case "backdrop-filter":
          style.backdropFilter = rawValue;
          break;
        case "background-clip":
        case "-webkit-background-clip":
          style.backgroundClip = rawValue;
          break;
        case "-webkit-text-fill-color":
          style.webkitTextFillColor = rawValue;
          break;
        case "box-shadow":
          style.shadow = parseBoxShadow(rawValue);
          break;
        case "z-index":
          style.zIndex = parseNumber(rawValue);
          break;
        case "object-fit":
          style.objectFit =
            rawValue === "contain" ? "contain" : rawValue === "fill" ? "fill" : "cover";
          break;
        case "grid-template-columns":
          style.gridColumns = parseGridColumnCount(rawValue);
          style.gridTemplateColumns = parseGridTracks(rawValue);
          break;
      }
    },
  });

  if (style.lineHeight !== undefined && style.lineHeight < 8 && style.fontSize !== undefined) {
    style.lineHeight = Math.round(style.lineHeight * style.fontSize);
  }

  if (style.gap === undefined) {
    style.gap =
      style.display === "grid" ? style.rowGap || style.columnGap : style.rowGap || style.columnGap;
  }

  return style;
};

export const extractStateStyleDeclarations = (declarationText: string) => {
  const stateProps: Record<string, string> = {};
  if (!declarationText.trim()) {
    return stateProps;
  }

  try {
    const ast = csstree.parse(declarationText, { context: "declarationList" });
    csstree.walk(ast, {
      visit: "Declaration",
      enter(node) {
        if (node.type !== "Declaration") {
          return;
        }
        const property = node.property.trim().toLowerCase();
        if (!isStateStyleProperty(property)) {
          return;
        }
        stateProps[property] = generateValue(node.value);
      },
    });
  } catch {
    return stateProps;
  }

  return stateProps;
};

export const extractVendorStyleDeclarations = (declarationText: string) => {
  const vendorProps: Record<string, string> = {};
  if (!declarationText.trim()) {
    return vendorProps;
  }

  try {
    const ast = csstree.parse(declarationText, { context: "declarationList" });
    csstree.walk(ast, {
      visit: "Declaration",
      enter(node) {
        if (node.type !== "Declaration") {
          return;
        }
        const property = node.property.trim().toLowerCase();
        if (!isVendorStyleProperty(property)) {
          return;
        }
        vendorProps[property] = generateValue(node.value);
      },
    });
  } catch {
    return vendorProps;
  }

  return vendorProps;
};

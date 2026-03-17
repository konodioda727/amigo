import Yoga, {
  Align,
  Direction,
  Display,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  MeasureMode,
  PositionType,
  Wrap,
  type Node as YogaNode,
} from "yoga-layout";
import { DEFAULT_FONT_SIZE } from "./constants";
import { computeStyle } from "./styles";
import type {
  ComputedStyle,
  LayoutTreeNode,
  LengthValue,
  MarginValue,
  MarkupElement,
} from "./types";
import { normalizeTextPreservingBreaks, normalizeWhitespace, resolveLength } from "./utils";

const isWhitespaceCodePoint = (codePoint: number) =>
  codePoint === 0x20 || codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d;

const isFullWidthCodePoint = (codePoint: number) =>
  codePoint >= 0x1100 &&
  (codePoint <= 0x115f ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1b000 && codePoint <= 0x1b001) ||
    (codePoint >= 0x1f200 && codePoint <= 0x1f251) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd));

const isEmojiCodePoint = (codePoint: number) =>
  (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
  (codePoint >= 0x2600 && codePoint <= 0x27bf) ||
  (codePoint >= 0xfe00 && codePoint <= 0xfe0f);

const estimateGlyphWidthUnits = (char: string) => {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) {
    return 0;
  }

  if (isWhitespaceCodePoint(codePoint)) {
    return 0.35;
  }

  if (isFullWidthCodePoint(codePoint)) {
    return 1;
  }

  if (isEmojiCodePoint(codePoint)) {
    return 1.1;
  }

  if ((codePoint >= 0x30 && codePoint <= 0x39) || (codePoint >= 0x61 && codePoint <= 0x7a)) {
    return 0.56;
  }

  if (codePoint >= 0x41 && codePoint <= 0x5a) {
    return 0.66;
  }

  if (
    (codePoint >= 0x21 && codePoint <= 0x2f) ||
    (codePoint >= 0x3a && codePoint <= 0x40) ||
    (codePoint >= 0x5b && codePoint <= 0x60) ||
    (codePoint >= 0x7b && codePoint <= 0x7e)
  ) {
    return 0.32;
  }

  return 0.62;
};

const estimateLineWidthUnits = (line: string) =>
  Array.from(line).reduce((sum, char) => sum + estimateGlyphWidthUnits(char), 0);

const estimateTextWidth = (text: string, fontSize: number, fontWeight = 400) => {
  const normalized = normalizeTextPreservingBreaks(text);
  const longestLineUnits = normalized
    .split("\n")
    .reduce((max, line) => Math.max(max, estimateLineWidthUnits(normalizeWhitespace(line))), 0);
  const weightMultiplier = fontWeight >= 700 ? 1.06 : fontWeight >= 600 ? 1.03 : 1;
  const edgePaddingUnits = longestLineUnits > 0 ? 0.16 : 0;
  return Math.max(
    fontSize,
    Math.ceil((longestLineUnits + edgePaddingUnits) * fontSize * weightMultiplier),
  );
};

const estimateTextHeight = (
  text: string,
  width: number,
  fontSize: number,
  lineHeight: number,
  fontWeight = 400,
) => {
  const normalized = normalizeTextPreservingBreaks(text);
  const totalLines = normalized.split("\n").reduce((sum, line) => {
    const estimatedWidth = estimateTextWidth(line || " ", fontSize, fontWeight);
    return sum + Math.max(1, Math.ceil(estimatedWidth / Math.max(width, fontSize)));
  }, 0);
  return Math.max(1, totalLines) * lineHeight;
};

const setYogaLength = (
  yogaNode: YogaNode,
  kind:
    | "width"
    | "minWidth"
    | "height"
    | "minHeight"
    | "maxHeight"
    | "maxWidth"
    | "padding"
    | "position",
  value: LengthValue | number | undefined,
  edge?: Edge,
) => {
  if (value === undefined) {
    return;
  }

  if (kind === "padding" && edge !== undefined && typeof value === "number") {
    yogaNode.setPadding(edge, value);
    return;
  }

  if (kind === "position" && edge !== undefined) {
    if (typeof value === "number") {
      yogaNode.setPosition(edge, value);
      return;
    }
    value.kind === "percent"
      ? yogaNode.setPositionPercent(edge, value.value)
      : yogaNode.setPosition(edge, value.value);
    return;
  }

  if (typeof value === "number") {
    if (kind === "width") yogaNode.setWidth(value);
    if (kind === "minWidth") yogaNode.setMinWidth(value);
    if (kind === "height") yogaNode.setHeight(value);
    if (kind === "minHeight") yogaNode.setMinHeight(value);
    if (kind === "maxHeight") yogaNode.setMaxHeight(value);
    if (kind === "maxWidth") yogaNode.setMaxWidth(value);
    return;
  }

  if (kind === "width") {
    value.kind === "percent"
      ? yogaNode.setWidthPercent(value.value)
      : yogaNode.setWidth(value.value);
  }
  if (kind === "minWidth") {
    value.kind === "percent"
      ? yogaNode.setMinWidthPercent(value.value)
      : yogaNode.setMinWidth(value.value);
  }
  if (kind === "height") {
    value.kind === "percent"
      ? yogaNode.setHeightPercent(value.value)
      : yogaNode.setHeight(value.value);
  }
  if (kind === "minHeight") {
    value.kind === "percent"
      ? yogaNode.setMinHeightPercent(value.value)
      : yogaNode.setMinHeight(value.value);
  }
  if (kind === "maxHeight") {
    value.kind === "percent"
      ? yogaNode.setMaxHeightPercent(value.value)
      : yogaNode.setMaxHeight(value.value);
  }
  if (kind === "maxWidth") {
    value.kind === "percent"
      ? yogaNode.setMaxWidthPercent(value.value)
      : yogaNode.setMaxWidth(value.value);
  }
};

const setYogaMargin = (yogaNode: YogaNode, edge: Edge, value: MarginValue | undefined) => {
  if (value === undefined) {
    return;
  }
  if (value === "auto") {
    yogaNode.setMarginAuto(edge);
    return;
  }
  if (value.kind === "percent") {
    yogaNode.setMarginPercent(edge, value.value);
    return;
  }
  yogaNode.setMargin(edge, value.value);
};

const alignMap: Record<string, Align> = {
  start: Align.FlexStart,
  center: Align.Center,
  end: Align.FlexEnd,
  stretch: Align.Stretch,
  "flex-start": Align.FlexStart,
  "flex-end": Align.FlexEnd,
};

const justifyMap: Record<string, Justify> = {
  start: Justify.FlexStart,
  center: Justify.Center,
  end: Justify.FlexEnd,
  "flex-start": Justify.FlexStart,
  "flex-end": Justify.FlexEnd,
  "space-between": Justify.SpaceBetween,
  "space-around": Justify.SpaceAround,
  "space-evenly": Justify.SpaceEvenly,
};

const applyYogaStyle = (yogaNode: YogaNode, element: MarkupElement, style: ComputedStyle) => {
  const isContainer =
    element.tagName === "page" ||
    element.tagName === "section" ||
    element.tagName === "div" ||
    element.tagName === "component";

  if (isContainer) {
    yogaNode.setDisplay(Display.Flex);
    const direction =
      element.tagName === "page"
        ? FlexDirection.Column
        : style.display === "flex"
          ? style.flexDirection === "column"
            ? FlexDirection.Column
            : FlexDirection.Row
          : FlexDirection.Column;
    yogaNode.setFlexDirection(direction);
    if (style.justifyContent && justifyMap[style.justifyContent]) {
      yogaNode.setJustifyContent(justifyMap[style.justifyContent]);
    }
    if (style.alignItems && alignMap[style.alignItems]) {
      yogaNode.setAlignItems(alignMap[style.alignItems]);
    }
    if (style.flexWrap === "wrap") {
      yogaNode.setFlexWrap(Wrap.Wrap);
    }
    const gap = style.gap ?? style.rowGap ?? style.columnGap;
    if (gap !== undefined) {
      yogaNode.setGap(Gutter.All, gap);
    }
  }

  if (style.flex !== undefined) {
    yogaNode.setFlex(style.flex);
  }
  if (style.flexGrow !== undefined) {
    yogaNode.setFlexGrow(style.flexGrow);
  }
  if (style.flexShrink !== undefined) {
    yogaNode.setFlexShrink(style.flexShrink);
  }
  if (style.flexBasis !== undefined) {
    if (style.flexBasis === "auto") {
      yogaNode.setFlexBasisAuto();
    } else if (style.flexBasis.kind === "percent") {
      yogaNode.setFlexBasisPercent(style.flexBasis.value);
    } else {
      yogaNode.setFlexBasis(style.flexBasis.value);
    }
  }
  if (style.position === "absolute") {
    yogaNode.setPositionType(PositionType.Absolute);
  }
  if (
    typeof style.aspectRatio === "number" &&
    Number.isFinite(style.aspectRatio) &&
    style.aspectRatio > 0
  ) {
    yogaNode.setAspectRatio(style.aspectRatio);
  }

  const hasAutoHorizontalMargins = style.margin?.left === "auto" && style.margin?.right === "auto";

  // Emulate common block layout semantics: max-width + margin:auto should fill
  // the available width first, then clamp and center, instead of shrinking to content.
  if (
    isContainer &&
    style.position !== "absolute" &&
    style.width === undefined &&
    style.maxWidth !== undefined &&
    hasAutoHorizontalMargins
  ) {
    yogaNode.setWidthPercent(100);
  }

  setYogaLength(yogaNode, "width", style.width);
  setYogaLength(yogaNode, "minWidth", style.minWidth);
  setYogaLength(yogaNode, "height", style.height);
  setYogaLength(yogaNode, "minHeight", style.minHeight);
  setYogaLength(yogaNode, "maxHeight", style.maxHeight);
  setYogaLength(yogaNode, "maxWidth", style.maxWidth);
  setYogaLength(yogaNode, "position", style.top, Edge.Top);
  setYogaLength(yogaNode, "position", style.right, Edge.Right);
  setYogaLength(yogaNode, "position", style.bottom, Edge.Bottom);
  setYogaLength(yogaNode, "position", style.left, Edge.Left);

  if (style.padding) {
    setYogaLength(yogaNode, "padding", style.padding.top, Edge.Top);
    setYogaLength(yogaNode, "padding", style.padding.right, Edge.Right);
    setYogaLength(yogaNode, "padding", style.padding.bottom, Edge.Bottom);
    setYogaLength(yogaNode, "padding", style.padding.left, Edge.Left);
  }

  if (style.margin) {
    setYogaMargin(yogaNode, Edge.Top, style.margin.top);
    setYogaMargin(yogaNode, Edge.Right, style.margin.right);
    setYogaMargin(yogaNode, Edge.Bottom, style.margin.bottom);
    setYogaMargin(yogaNode, Edge.Left, style.margin.left);
  }

  if (element.tagName === "text" || element.tagName === "button") {
    const text = element.textContent || element.attributes.text || "";
    const fontSize = style.fontSize ?? DEFAULT_FONT_SIZE;
    const fontWeight = style.fontWeight ?? 400;
    const lineHeight = style.lineHeight ?? Math.round(fontSize * 1.4);
    const horizontalPadding = style.padding ? style.padding.left + style.padding.right : 0;
    const verticalPadding = style.padding ? style.padding.top + style.padding.bottom : 0;
    if (element.tagName === "button" && style.width === undefined) {
      if (style.textAlign === "center") {
        yogaNode.setAlignSelf(Align.Center);
      } else if (style.textAlign === "right") {
        yogaNode.setAlignSelf(Align.FlexEnd);
      } else {
        yogaNode.setAlignSelf(Align.FlexStart);
      }
    }
    yogaNode.setMeasureFunc((width, widthMode) => {
      const intrinsicTextWidth = style.maxWidth
        ? Math.min(
            estimateTextWidth(text, fontSize, fontWeight),
            resolveLength(
              style.maxWidth,
              widthMode === MeasureMode.Undefined ? 0 : width,
              Number.MAX_SAFE_INTEGER,
            ),
          )
        : estimateTextWidth(text, fontSize, fontWeight);
      const intrinsicWidth =
        element.tagName === "button" ? intrinsicTextWidth + horizontalPadding : intrinsicTextWidth;
      const availableWidth =
        widthMode === MeasureMode.Undefined ? intrinsicWidth : Math.max(width, fontSize);
      const finalWidth =
        widthMode === MeasureMode.Exactly
          ? width
          : element.tagName === "button"
            ? Math.min(availableWidth, intrinsicWidth)
            : Math.min(availableWidth, intrinsicTextWidth);
      const textMeasureWidth =
        element.tagName === "button"
          ? Math.max(fontSize, finalWidth - horizontalPadding)
          : Math.max(fontSize, finalWidth);
      const measuredHeight = estimateTextHeight(
        text,
        textMeasureWidth,
        fontSize,
        lineHeight,
        fontWeight,
      );
      return {
        width: Math.ceil(finalWidth),
        height: Math.ceil(measuredHeight + verticalPadding),
      };
    });
  } else if (element.tagName === "img" || element.tagName === "shape") {
    yogaNode.setMeasureFunc(() => ({
      width:
        style.width !== undefined
          ? resolveLength(style.width, 240, element.tagName === "img" ? 240 : 120)
          : style.height !== undefined &&
              typeof style.aspectRatio === "number" &&
              style.aspectRatio > 0
            ? resolveLength(style.height, 240, element.tagName === "img" ? 180 : 120) *
              style.aspectRatio
            : element.tagName === "img"
              ? 240
              : 120,
      height:
        style.height !== undefined
          ? resolveLength(style.height, 240, element.tagName === "img" ? 180 : 120)
          : style.width !== undefined &&
              typeof style.aspectRatio === "number" &&
              style.aspectRatio > 0
            ? resolveLength(style.width, 240, element.tagName === "img" ? 240 : 120) /
              style.aspectRatio
            : element.tagName === "img"
              ? 180
              : 120,
    }));
  }
};

export const buildLayoutTree = (
  element: MarkupElement,
  inheritedTextAlign?: ComputedStyle["textAlign"],
): LayoutTreeNode => {
  const style = computeStyle(element.attributes);
  if (
    !style.textAlign &&
    inheritedTextAlign &&
    (element.tagName === "text" || element.tagName === "button")
  ) {
    style.textAlign = inheritedTextAlign;
  }
  const yogaNode = Yoga.Node.create();
  const nextInheritedTextAlign = style.textAlign ?? inheritedTextAlign;
  const children = element.children.map((child) => buildLayoutTree(child, nextInheritedTextAlign));
  applyYogaStyle(yogaNode, element, style);
  children.forEach((child, index) => {
    yogaNode.insertChild(child.yogaNode, index);
  });
  return { element, style, yogaNode, children };
};

export const freeLayoutTree = (tree: LayoutTreeNode) => {
  tree.children.forEach(freeLayoutTree);
  tree.yogaNode.free();
};

export const calculateTreeLayout = (tree: LayoutTreeNode, width: number) => {
  tree.yogaNode.setWidth(width);
  tree.yogaNode.calculateLayout(width, undefined, Direction.LTR);
};

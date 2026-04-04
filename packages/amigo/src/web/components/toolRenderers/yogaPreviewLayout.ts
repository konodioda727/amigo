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
import type { ParsedYogaLayout, YogaPreviewNode } from "./layoutSourceParser";

export interface ComputedYogaPreviewNode {
  id: string;
  moduleId?: string;
  label?: string;
  textContent?: string;
  style: Record<string, string | number | boolean>;
  frame: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  children: ComputedYogaPreviewNode[];
}

export interface FlattenedYogaPreviewNode {
  id: string;
  moduleId?: string;
  label?: string;
  textContent?: string;
  style: Record<string, string | number | boolean>;
  frame: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  depth: number;
}

interface BuiltYogaNode {
  node: YogaPreviewNode;
  yogaNode: YogaNode;
  children: BuiltYogaNode[];
}

const estimateTextWidth = (text: string, fontSize: number) =>
  Math.max(fontSize, Math.ceil(Array.from(text).length * fontSize * 0.62));

const estimateTextHeight = (text: string, width: number, fontSize: number, lineHeight: number) => {
  const safeWidth = Math.max(fontSize, width);
  const lines = text
    .split("\n")
    .reduce(
      (sum, line) =>
        sum + Math.max(1, Math.ceil(estimateTextWidth(line || " ", fontSize) / safeWidth)),
      0,
    );
  return Math.max(lineHeight, lines * lineHeight);
};

const parseNumericLike = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^-?(\d+(?:\.\d+)?)(?:px)?$/);
  return match ? Number(match[1]) : undefined;
};

const parseLength = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { unit: "point" as const, value };
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.endsWith("%")) {
    const numeric = Number(trimmed.slice(0, -1));
    return Number.isFinite(numeric) ? { unit: "percent" as const, value: numeric } : undefined;
  }

  const numeric = parseNumericLike(trimmed);
  return numeric !== undefined ? { unit: "point" as const, value: numeric } : undefined;
};

const parseSpacing = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { top: value, right: value, bottom: value, left: value };
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const parts = value
    .trim()
    .split(/\s+/)
    .map((part) => parseNumericLike(part))
    .filter((part): part is number => part !== undefined);

  if (parts.length === 0) {
    return undefined;
  }

  if (parts.length === 1) {
    return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  }

  if (parts.length === 2) {
    return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  }

  if (parts.length === 3) {
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  }

  return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
};

const parseLineHeight = (value: unknown, fontSize: number) => {
  const numeric = parseNumericLike(value);
  if (numeric === undefined) {
    return Math.round(fontSize * 1.4);
  }
  return numeric <= 4 ? Math.round(fontSize * numeric) : numeric;
};

const parseFontWeight = (value: unknown) => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    return 400;
  }

  const trimmed = value.trim().toLowerCase();
  if (trimmed === "bold") {
    return 700;
  }
  if (trimmed === "semibold") {
    return 600;
  }

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : 400;
};

const parseGridColumnCount = (value: unknown) => {
  if (typeof value !== "string") {
    return 0;
  }

  const trimmed = value.trim();
  const repeatMatch = trimmed.match(/repeat\(\s*(\d+)\s*,/i);
  if (repeatMatch) {
    return Number(repeatMatch[1]);
  }

  const columns = trimmed.split(/\s+/).filter(Boolean);
  return columns.length;
};

const setYogaLength = (
  yogaNode: YogaNode,
  type: "width" | "height" | "minWidth" | "minHeight" | "maxWidth" | "maxHeight",
  value: unknown,
) => {
  const length = parseLength(value);
  if (!length) {
    return;
  }

  const setters = {
    width:
      length.unit === "percent"
        ? yogaNode.setWidthPercent.bind(yogaNode)
        : yogaNode.setWidth.bind(yogaNode),
    height:
      length.unit === "percent"
        ? yogaNode.setHeightPercent.bind(yogaNode)
        : yogaNode.setHeight.bind(yogaNode),
    minWidth:
      length.unit === "percent"
        ? yogaNode.setMinWidthPercent.bind(yogaNode)
        : yogaNode.setMinWidth.bind(yogaNode),
    minHeight:
      length.unit === "percent"
        ? yogaNode.setMinHeightPercent.bind(yogaNode)
        : yogaNode.setMinHeight.bind(yogaNode),
    maxWidth:
      length.unit === "percent"
        ? yogaNode.setMaxWidthPercent.bind(yogaNode)
        : yogaNode.setMaxWidth.bind(yogaNode),
    maxHeight:
      length.unit === "percent"
        ? yogaNode.setMaxHeightPercent.bind(yogaNode)
        : yogaNode.setMaxHeight.bind(yogaNode),
  };

  setters[type](length.value);
};

const setYogaPosition = (yogaNode: YogaNode, edge: Edge, value: unknown) => {
  const length = parseLength(value);
  if (!length) {
    return;
  }

  if (length.unit === "percent") {
    yogaNode.setPositionPercent(edge, length.value);
  } else {
    yogaNode.setPosition(edge, length.value);
  }
};

const setYogaSpacing = (
  _yogaNode: YogaNode,
  value: unknown,
  setter: (edge: Edge, amount: number) => void,
) => {
  const spacing = parseSpacing(value);
  if (!spacing) {
    return;
  }

  setter(Edge.Top, spacing.top);
  setter(Edge.Right, spacing.right);
  setter(Edge.Bottom, spacing.bottom);
  setter(Edge.Left, spacing.left);
};

const alignMap: Record<string, Align> = {
  center: Align.Center,
  start: Align.FlexStart,
  end: Align.FlexEnd,
  stretch: Align.Stretch,
  "flex-start": Align.FlexStart,
  "flex-end": Align.FlexEnd,
};

const justifyMap: Record<string, Justify> = {
  center: Justify.Center,
  start: Justify.FlexStart,
  end: Justify.FlexEnd,
  "flex-start": Justify.FlexStart,
  "flex-end": Justify.FlexEnd,
  "space-between": Justify.SpaceBetween,
  "space-around": Justify.SpaceAround,
  "space-evenly": Justify.SpaceEvenly,
};

const buildYogaTree = (node: YogaPreviewNode, parentGridColumns = 0): BuiltYogaNode => {
  const yogaNode = Yoga.Node.create();
  const style = node.style;
  const isGrid = style.display === "grid";
  const gridColumns = parseGridColumnCount(style.gridTemplateColumns);

  yogaNode.setDisplay(Display.Flex);
  yogaNode.setFlexDirection(
    isGrid
      ? FlexDirection.Row
      : style.flexDirection === "row"
        ? FlexDirection.Row
        : FlexDirection.Column,
  );

  if (isGrid || style.flexWrap === "wrap") {
    yogaNode.setFlexWrap(Wrap.Wrap);
  }

  if (typeof style.justifyContent === "string" && justifyMap[style.justifyContent]) {
    yogaNode.setJustifyContent(justifyMap[style.justifyContent]);
  }

  if (typeof style.alignItems === "string" && alignMap[style.alignItems]) {
    yogaNode.setAlignItems(alignMap[style.alignItems]);
  }

  if (typeof style.flex === "number") {
    yogaNode.setFlex(style.flex);
  }
  if (typeof style.flexGrow === "number") {
    yogaNode.setFlexGrow(style.flexGrow);
  }
  if (typeof style.flexShrink === "number") {
    yogaNode.setFlexShrink(style.flexShrink);
  }

  setYogaLength(yogaNode, "width", style.width);
  setYogaLength(yogaNode, "height", style.height);
  setYogaLength(yogaNode, "minWidth", style.minWidth);
  setYogaLength(yogaNode, "minHeight", style.minHeight);
  setYogaLength(yogaNode, "maxWidth", style.maxWidth);
  setYogaLength(yogaNode, "maxHeight", style.maxHeight);

  if (style.position === "absolute") {
    yogaNode.setPositionType(PositionType.Absolute);
  }

  setYogaPosition(yogaNode, Edge.Top, style.top);
  setYogaPosition(yogaNode, Edge.Right, style.right);
  setYogaPosition(yogaNode, Edge.Bottom, style.bottom);
  setYogaPosition(yogaNode, Edge.Left, style.left);

  setYogaSpacing(yogaNode, style.padding, yogaNode.setPadding.bind(yogaNode));
  setYogaSpacing(yogaNode, style.margin, yogaNode.setMargin.bind(yogaNode));

  const paddingInline = parseSpacing(style.paddingInline);
  if (paddingInline) {
    yogaNode.setPadding(Edge.Left, paddingInline.left);
    yogaNode.setPadding(Edge.Right, paddingInline.right);
  }
  const paddingBlock = parseSpacing(style.paddingBlock);
  if (paddingBlock) {
    yogaNode.setPadding(Edge.Top, paddingBlock.top);
    yogaNode.setPadding(Edge.Bottom, paddingBlock.bottom);
  }

  const gap = parseNumericLike(style.gap);
  const rowGap = parseNumericLike(style.rowGap);
  const columnGap = parseNumericLike(style.columnGap);
  if (gap !== undefined) {
    yogaNode.setGap(Gutter.All, gap);
  } else {
    if (rowGap !== undefined) {
      yogaNode.setGap(Gutter.Row, rowGap);
    }
    if (columnGap !== undefined) {
      yogaNode.setGap(Gutter.Column, columnGap);
    }
  }

  if (parentGridColumns > 0 && style.width === undefined && style.flex === undefined) {
    yogaNode.setWidthPercent(100 / parentGridColumns);
    yogaNode.setFlexGrow(0);
    yogaNode.setFlexShrink(0);
  }

  const text = node.textContent?.trim() || "";
  const hasTextOnlyLeaf = !node.children.length && Boolean(text);
  const hasEmptyLeaf = !node.children.length && !text;

  if (hasTextOnlyLeaf || hasEmptyLeaf) {
    const fontSize = parseNumericLike(style.fontSize) || 12;
    const _fontWeight = parseFontWeight(style.fontWeight);
    const lineHeight = parseLineHeight(style.lineHeight, fontSize);
    const padding = parseSpacing(style.padding);
    const horizontalPadding = padding ? padding.left + padding.right : 0;
    const verticalPadding = padding ? padding.top + padding.bottom : 0;

    yogaNode.setMeasureFunc((width, widthMode) => {
      if (hasEmptyLeaf) {
        const fallbackWidth = parseNumericLike(style.width) || 24;
        const fallbackHeight = parseNumericLike(style.height) || 24;
        return { width: fallbackWidth, height: fallbackHeight };
      }

      const intrinsicTextWidth = estimateTextWidth(text, fontSize) + horizontalPadding;
      const availableWidth =
        widthMode === MeasureMode.Undefined ? intrinsicTextWidth : Math.max(fontSize, width);
      const finalWidth =
        widthMode === MeasureMode.Exactly ? width : Math.min(availableWidth, intrinsicTextWidth);
      const measuredHeight = estimateTextHeight(
        text,
        Math.max(fontSize, finalWidth - horizontalPadding),
        fontSize,
        lineHeight,
      );

      return {
        width: Math.ceil(finalWidth),
        height: Math.ceil(measuredHeight + verticalPadding),
      };
    });
  }

  const children = node.children.map((child) => buildYogaTree(child, isGrid ? gridColumns : 0));
  children.forEach((child, index) => {
    yogaNode.insertChild(child.yogaNode, index);
  });

  return { node, yogaNode, children };
};

const serializeComputedTree = (
  built: BuiltYogaNode,
  parentLeft = 0,
  parentTop = 0,
): ComputedYogaPreviewNode => {
  const layout = built.yogaNode.getComputedLayout();
  const left = parentLeft + layout.left;
  const top = parentTop + layout.top;

  return {
    id: built.node.id,
    moduleId: built.node.moduleId,
    label: built.node.label,
    textContent: built.node.textContent,
    style: built.node.style,
    frame: {
      left,
      top,
      width: layout.width,
      height: layout.height,
    },
    children: built.children.map((child) => serializeComputedTree(child, left, top)),
  };
};

const freeBuiltTree = (built: BuiltYogaNode) => {
  built.children.forEach(freeBuiltTree);
  built.yogaNode.free();
};

export const computeYogaPreviewLayout = (parsed: ParsedYogaLayout | null) => {
  if (!parsed?.root) {
    return null;
  }

  const built = buildYogaTree(parsed.root);

  try {
    built.yogaNode.setWidth(parsed.canvasWidth);
    built.yogaNode.setHeight(parsed.canvasHeight);
    built.yogaNode.calculateLayout(parsed.canvasWidth, parsed.canvasHeight, Direction.LTR);
    return serializeComputedTree(built);
  } finally {
    freeBuiltTree(built);
  }
};

export const flattenComputedYogaPreviewLayout = (root: ComputedYogaPreviewNode | null) => {
  if (!root) {
    return [] as FlattenedYogaPreviewNode[];
  }

  const flattened: FlattenedYogaPreviewNode[] = [];
  const stack = root.children
    .slice()
    .reverse()
    .map((child) => ({ node: child, depth: 0 }));

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    flattened.push({
      id: current.node.id,
      moduleId: current.node.moduleId,
      label: current.node.label,
      textContent: current.node.textContent,
      style: current.node.style,
      frame: current.node.frame,
      depth: current.depth,
    });

    for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
      stack.push({
        node: current.node.children[index],
        depth: current.depth + 1,
      });
    }
  }

  return flattened;
};

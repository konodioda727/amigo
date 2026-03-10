import type { ExecutableDesignDoc } from "../designDocSchema";
import {
  buildNodeStyleFromShape,
  extractFirstFill,
  extractUniformRadius,
  getRelativePosition,
  getRootShapeIds,
  inferLineHeight,
  isPlainObject,
  isTextInsideRect,
  isValidUrlString,
  normalizeHexColor,
  registerTypographyToken,
  toFiniteNumber,
  toPositiveNumber,
} from "./shared";
import type {
  DesignNode,
  DesignSection,
  PenpotImportContext,
  PenpotRpcFile,
  PenpotRpcShape,
  PenpotRpcTextContent,
  PenpotTypographyStyle,
} from "./types";

const collectTextRuns = (
  node: PenpotRpcTextContent | undefined,
  runs: PenpotRpcTextContent[] = [],
) => {
  if (!node || !isPlainObject(node)) {
    return runs;
  }

  if (typeof node.text === "string") {
    runs.push(node);
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectTextRuns(child, runs);
    }
  }

  return runs;
};

const extractTextString = (shape: PenpotRpcShape) => {
  const positionDataText =
    Array.isArray(shape.positionData) && typeof shape.positionData[0]?.text === "string"
      ? shape.positionData[0].text
      : "";
  if (positionDataText.trim()) {
    return positionDataText;
  }

  return collectTextRuns(shape.content)
    .map((item) => item.text || "")
    .join("")
    .trim();
};

const extractTextFillColor = (fills: unknown) => {
  if (!Array.isArray(fills)) {
    return null;
  }

  for (const fill of fills) {
    if (isPlainObject(fill)) {
      const color = normalizeHexColor(fill["fill-color"]);
      if (color) {
        return color;
      }
    }
  }

  return null;
};

const extractTypographyStyle = (shape: PenpotRpcShape): PenpotTypographyStyle => {
  const firstRun = collectTextRuns(shape.content)[0];
  const position = Array.isArray(shape.positionData) ? shape.positionData[0] : undefined;
  const fontSize = toPositiveNumber(position?.fontSize ?? firstRun?.["font-size"], 16);
  const fontWeight = Math.max(
    100,
    Math.round(toFiniteNumber(position?.fontWeight ?? firstRun?.["font-weight"], 400)),
  );
  const letterSpacing = toFiniteNumber(position?.letterSpacing ?? firstRun?.["letter-spacing"], 0);
  const color =
    extractTextFillColor(position?.fills) || extractTextFillColor(firstRun?.fills) || "#111111";

  return {
    color,
    fontFamily:
      (typeof position?.fontFamily === "string" && position.fontFamily.trim()) ||
      (typeof firstRun?.["font-family"] === "string" && firstRun["font-family"].trim()) ||
      "sourcesanspro",
    fontSize,
    fontWeight,
    lineHeight: inferLineHeight(fontSize, firstRun?.["line-height"]),
    letterSpacing:
      Number.isFinite(letterSpacing) && Math.abs(letterSpacing) > 0.01 ? letterSpacing : undefined,
  };
};

const toTextNode = (
  shape: PenpotRpcShape,
  parentX: number,
  parentY: number,
  context: PenpotImportContext,
  zIndex: number,
): DesignNode | null => {
  const id = typeof shape.id === "string" ? shape.id : "";
  if (!id) {
    return null;
  }

  const typographyStyle = extractTypographyStyle(shape);
  const fontToken = registerTypographyToken(context, typographyStyle);
  const style = buildNodeStyleFromShape(shape, typographyStyle, context);
  const position = getRelativePosition(shape, parentX, parentY);
  const text = extractTextString(shape) || shape.name || "Text";

  return {
    id,
    name: shape.name || "Text",
    type: "text",
    text,
    ...position,
    zIndex,
    style: style
      ? {
          ...style,
          fontToken,
        }
      : {
          fontToken,
        },
  };
};

const buildShapeNode = (
  shape: PenpotRpcShape,
  parentX: number,
  parentY: number,
  zIndex: number,
  context: PenpotImportContext,
): DesignNode | null => {
  const id = typeof shape.id === "string" ? shape.id : "";
  if (!id) {
    return null;
  }

  const position = getRelativePosition(shape, parentX, parentY);
  const radius = extractUniformRadius(shape);
  const style = buildNodeStyleFromShape(shape, undefined, context);
  const shapeKind =
    Math.min(position.width, position.height) > 1 &&
    radius !== undefined &&
    Math.abs(radius - Math.min(position.width, position.height) / 2) < 1
      ? "ellipse"
      : position.width <= 1 || position.height <= 1
        ? "line"
        : "rect";

  return {
    id,
    name: shape.name || "Shape",
    type: "shape",
    shapeKind,
    ...position,
    zIndex,
    ...(style ? { style } : {}),
  };
};

const parseCompositeRectNode = (
  rectShape: PenpotRpcShape,
  labelShape: PenpotRpcShape,
  parentX: number,
  parentY: number,
  zIndex: number,
  context: PenpotImportContext,
): DesignNode | null => {
  const id = typeof rectShape.id === "string" ? rectShape.id : "";
  if (!id) {
    return null;
  }

  const labelText = extractTextString(labelShape) || labelShape.name || rectShape.name || "";
  const labelTypography = extractTypographyStyle(labelShape);
  const fontToken = registerTypographyToken(context, labelTypography);
  const style = buildNodeStyleFromShape(rectShape, labelTypography, context) || {};
  const fill = extractFirstFill(rectShape);
  if (fill && !context.colorHints.primary) {
    context.colorHints.primary = fill.color;
  }

  const nodeStyle = {
    ...style,
    fontToken,
  };
  const position = getRelativePosition(rectShape, parentX, parentY);
  const labelName = (labelShape.name || "").trim().toLowerCase();
  const isImage = labelName.endsWith("placeholder");
  const assetUrl = isValidUrlString(labelText) ? labelText : undefined;

  if (isImage) {
    return {
      id,
      name: rectShape.name || "Image",
      type: "image",
      ...position,
      zIndex,
      ...(assetUrl ? { assetUrl } : {}),
      style: nodeStyle,
    };
  }

  return {
    id,
    name: rectShape.name || "Button",
    type: "button",
    text: labelText,
    ...position,
    zIndex,
    style: nodeStyle,
  };
};

const maybeFindCompositeLabel = (
  rectShape: PenpotRpcShape,
  siblingIds: string[],
  currentIndex: number,
  objects: Record<string, PenpotRpcShape>,
) => {
  for (let index = currentIndex + 1; index < siblingIds.length; index += 1) {
    const sibling = objects[siblingIds[index] || ""];
    if (!sibling || sibling.hidden || sibling.type !== "text") {
      continue;
    }

    if (!isTextInsideRect(sibling, rectShape)) {
      continue;
    }

    const labelName = (sibling.name || "").trim().toLowerCase();
    if (labelName.endsWith("label") || labelName.endsWith("placeholder")) {
      return sibling;
    }
  }

  return null;
};

const parsePenpotNodeList = (
  shapeIds: string[],
  parentX: number,
  parentY: number,
  context: PenpotImportContext,
): DesignNode[] => {
  const nodes: DesignNode[] = [];
  const consumedIds = new Set<string>();

  shapeIds.forEach((shapeId, index) => {
    if (!shapeId || consumedIds.has(shapeId)) {
      return;
    }

    const shape = context.objects[shapeId];
    if (!shape || shape.hidden || typeof shape.id !== "string") {
      return;
    }

    if (shape.type === "rect") {
      const labelShape = maybeFindCompositeLabel(shape, shapeIds, index, context.objects);
      if (labelShape?.id) {
        consumedIds.add(labelShape.id);
        const compositeNode = parseCompositeRectNode(
          shape,
          labelShape,
          parentX,
          parentY,
          index,
          context,
        );
        if (compositeNode) {
          nodes.push(compositeNode);
          return;
        }
      }
    }

    if (shape.type === "frame") {
      const position = getRelativePosition(shape, parentX, parentY);
      const children = parsePenpotNodeList(
        shape.shapes || [],
        toFiniteNumber(shape.x, 0),
        toFiniteNumber(shape.y, 0),
        context,
      );
      const style = buildNodeStyleFromShape(shape, undefined, context);
      nodes.push({
        id: shape.id,
        name: shape.name || "Container",
        type: "container",
        ...position,
        zIndex: index,
        layout: {
          mode: "absolute",
        },
        ...(style ? { style } : {}),
        ...(children.length > 0 ? { children } : {}),
      });
      return;
    }

    if (shape.type === "text") {
      const textNode = toTextNode(shape, parentX, parentY, context, index);
      if (textNode) {
        nodes.push(textNode);
      }
      return;
    }

    const shapeNode = buildShapeNode(shape, parentX, parentY, index, context);
    if (shapeNode) {
      nodes.push(shapeNode);
    }
  });

  return nodes;
};

const buildSectionFromShape = (
  shape: PenpotRpcShape,
  pageWidth: number,
  context: PenpotImportContext,
  index: number,
): DesignSection | null => {
  const id = typeof shape.id === "string" ? shape.id : "";
  if (!id) {
    return null;
  }

  const absX = toFiniteNumber(shape.x, 0);
  const absY = toFiniteNumber(shape.y, 0);
  const width = toPositiveNumber(shape.width, pageWidth);
  const height = toPositiveNumber(shape.height, 1);
  const baseName = shape.name || `Section ${index + 1}`;
  const background = extractFirstFill(shape)?.color;

  if (shape.type === "frame") {
    return {
      id,
      name: baseName,
      kind: baseName.trim().toLowerCase().replace(/\s+/g, "-") || "section",
      y: Math.max(0, absY),
      height,
      ...(background ? { background } : {}),
      layout: {
        mode: "absolute",
      },
      nodes: parsePenpotNodeList(shape.shapes || [], absX, absY, context),
    };
  }

  const standaloneNode =
    shape.type === "text"
      ? toTextNode(shape, 0, absY, context, 0)
      : buildShapeNode(shape, 0, absY, 0, context);

  if (!standaloneNode) {
    return null;
  }

  return {
    id,
    name: baseName,
    kind: "section",
    y: Math.max(0, absY),
    height,
    layout: {
      mode: "absolute",
    },
    nodes: [
      {
        ...standaloneNode,
        x: absX,
        y: 0,
        width,
        height,
      },
    ],
  };
};

const buildColorTokens = (background: string, context: PenpotImportContext) => {
  const colors: ExecutableDesignDoc["designTokens"]["colors"] = {
    background,
  };

  if (context.colorHints.surface) {
    colors.surface = context.colorHints.surface;
  }
  if (context.colorHints.primary) {
    colors.primary = context.colorHints.primary;
  }
  if (context.colorHints.textPrimary) {
    colors.textPrimary = context.colorHints.textPrimary;
  }
  if (context.colorHints.textSecondary) {
    colors.textSecondary = context.colorHints.textSecondary;
  }

  return colors;
};

export const convertPenpotFileToDesignDoc = (
  file: PenpotRpcFile,
  pageId: string,
  existingDocument?: ExecutableDesignDoc | null,
): ExecutableDesignDoc => {
  const page = file.data?.pagesIndex?.[pageId];
  const objects = page?.objects || {};
  const rootShapeIds = getRootShapeIds(file, pageId);
  if (rootShapeIds.length === 0) {
    throw new Error("Penpot 页面为空，无法回写 design doc");
  }

  const pageWidth = Math.max(
    existingDocument?.page.width ?? 0,
    ...rootShapeIds.map((shapeId) => {
      const shape = objects[shapeId];
      return toFiniteNumber(shape?.x, 0) + toPositiveNumber(shape?.width, 1);
    }),
  );
  const minHeight = Math.max(
    existingDocument?.page.minHeight ?? 0,
    ...rootShapeIds.map((shapeId) => {
      const shape = objects[shapeId];
      return toFiniteNumber(shape?.y, 0) + toPositiveNumber(shape?.height, 1);
    }),
  );
  const background =
    normalizeHexColor(page?.background) || existingDocument?.page.background || "#FFFFFF";
  const context: PenpotImportContext = {
    objects,
    typography: {},
    typographyIndex: new Map<string, string>(),
    colorHints: {},
  };
  const sections = rootShapeIds
    .map((shapeId, index) =>
      buildSectionFromShape(objects[shapeId] || {}, pageWidth, context, index),
    )
    .filter((section): section is DesignSection => section !== null);

  if (sections.length === 0) {
    throw new Error("Penpot 页面没有可转换的图层，无法回写 design doc");
  }

  return {
    page: {
      name: page?.name || existingDocument?.page.name || `Penpot ${pageId}`,
      ...(existingDocument?.page.path ? { path: existingDocument.page.path } : {}),
      width: Math.max(1, Math.round(pageWidth)),
      minHeight: Math.max(1, Math.round(minHeight)),
      background,
    },
    designTokens: {
      colors: buildColorTokens(background, context),
      spacing: existingDocument?.designTokens.spacing || {},
      radius: existingDocument?.designTokens.radius || {},
      typography: context.typography,
    },
    sections,
  };
};

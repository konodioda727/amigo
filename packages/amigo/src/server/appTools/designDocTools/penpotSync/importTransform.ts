import type { ExecutableDesignDoc } from "../designDocSchema";
import {
  buildNodeStyleFromShape,
  extractFirstFill,
  extractUniformRadius,
  getAnchorForShape,
  getPenpotDisplayName,
  getRelativePosition,
  getRootShapeIds,
  inferLineHeight,
  isPlainObject,
  isTextInsideRect,
  isValidUrlString,
  normalizeHexColor,
  parsePenpotSemanticName,
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
  PenpotSemanticAnchorMap,
  PenpotTypographyStyle,
} from "./types";

const getShapeIdentity = (
  shape: PenpotRpcShape,
  fallbackName: string,
  anchors?: PenpotSemanticAnchorMap,
) => {
  const anchor = getAnchorForShape(anchors, shape);
  const semantic = parsePenpotSemanticName(shape.name);
  const id = anchor?.semanticId || semantic?.semanticId || "";
  const name = anchor?.displayName || getPenpotDisplayName(shape.name, fallbackName);

  return {
    id,
    name,
    semantic,
  };
};

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

const findFirstParagraph = (
  node: PenpotRpcTextContent | undefined,
): PenpotRpcTextContent | null => {
  if (!node || !isPlainObject(node)) {
    return null;
  }

  if ((node as { type?: unknown }).type === "paragraph") {
    return node;
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const paragraph = findFirstParagraph(child);
      if (paragraph) {
        return paragraph;
      }
    }
  }

  return null;
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

const hasImageFill = (shape: PenpotRpcShape) =>
  Array.isArray(shape.fills) &&
  shape.fills.some(
    (fill) =>
      isPlainObject(fill) && (isPlainObject(fill.fillImage) || isPlainObject(fill["fill-image"])),
  );

const extractTypographyStyle = (shape: PenpotRpcShape): PenpotTypographyStyle => {
  const firstRun = collectTextRuns(shape.content)[0];
  const paragraph = findFirstParagraph(shape.content);
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
    align:
      position?.textAlign === "center" || position?.textAlign === "right"
        ? position.textAlign
        : paragraph?.["text-align"] === "center" || paragraph?.["text-align"] === "right"
          ? paragraph["text-align"]
          : "left",
  };
};

const toTextNode = (
  shape: PenpotRpcShape,
  parentX: number,
  parentY: number,
  context: PenpotImportContext,
  zIndex: number,
): DesignNode | null => {
  const identity = getShapeIdentity(shape, "Text", context.anchors);
  const id = identity.id;
  if (!id) {
    return null;
  }

  const typographyStyle = extractTypographyStyle(shape);
  const fontToken = registerTypographyToken(context, typographyStyle);
  const style = buildNodeStyleFromShape(shape, typographyStyle, context);
  const position = getRelativePosition(shape, parentX, parentY);
  const text = extractTextString(shape) || identity.name || "Text";
  const existingProps = context.existingNodeProps.get(id);

  return {
    id,
    name: identity.name,
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
    ...(existingProps ? { props: existingProps } : {}),
  };
};

const buildShapeNode = (
  shape: PenpotRpcShape,
  parentX: number,
  parentY: number,
  zIndex: number,
  context: PenpotImportContext,
): DesignNode | null => {
  const identity = getShapeIdentity(shape, "Shape", context.anchors);
  const id = identity.id;
  if (!id) {
    return null;
  }

  const anchor = getAnchorForShape(context.anchors, shape);
  const existingNode = context.existingNodes.get(id);
  if (anchor?.nodeType === "image" || existingNode?.type === "image" || hasImageFill(shape)) {
    const position = getRelativePosition(shape, parentX, parentY);
    const style = buildNodeStyleFromShape(shape, undefined, context);
    return {
      id,
      name: identity.name,
      type: "image",
      ...position,
      zIndex,
      ...(existingNode?.props ? { props: existingNode.props } : {}),
      ...(typeof anchor?.assetUrl === "string"
        ? { assetUrl: anchor.assetUrl }
        : typeof existingNode?.assetUrl === "string"
          ? { assetUrl: existingNode.assetUrl }
          : {}),
      ...(typeof anchor?.imageFit === "string"
        ? { imageFit: anchor.imageFit }
        : typeof existingNode?.imageFit === "string"
          ? { imageFit: existingNode.imageFit }
          : {}),
      ...(style ? { style } : {}),
    };
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
  const existingProps = context.existingNodeProps.get(id);

  return {
    id,
    name: identity.name,
    type: "shape",
    shapeKind,
    ...position,
    zIndex,
    ...(existingProps ? { props: existingProps } : {}),
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
  const rectIdentity = getShapeIdentity(rectShape, "Button", context.anchors);
  const id = rectIdentity.id;
  if (!id) {
    return null;
  }

  const labelIdentity = getShapeIdentity(labelShape, `${rectIdentity.name} Label`, context.anchors);
  const labelText = extractTextString(labelShape) || labelIdentity.name || rectIdentity.name || "";
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
  const labelName = labelIdentity.name.trim().toLowerCase();
  const isImage = labelName.endsWith("placeholder");
  const assetUrl = isValidUrlString(labelText) ? labelText : undefined;
  const existingProps = context.existingNodeProps.get(id);

  if (isImage) {
    return {
      id,
      name: rectIdentity.name || "Image",
      type: "image",
      ...position,
      zIndex,
      ...(existingProps ? { props: existingProps } : {}),
      ...(assetUrl ? { assetUrl } : {}),
      style: nodeStyle,
    };
  }

  return {
    id,
    name: rectIdentity.name || "Button",
    type: "button",
    text: labelText,
    ...position,
    zIndex,
    ...(existingProps ? { props: existingProps } : {}),
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

    const labelName = getPenpotDisplayName(sibling.name, "").trim().toLowerCase();
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
      const identity = getShapeIdentity(shape, "Container", context.anchors);
      nodes.push({
        id: identity.id,
        name: identity.name,
        type: "container",
        ...position,
        zIndex: index,
        layout: {
          mode: "absolute",
        },
        ...(context.existingNodeProps.get(identity.id)
          ? { props: context.existingNodeProps.get(identity.id) }
          : {}),
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
  const identity = getShapeIdentity(shape, `Section ${index + 1}`, context.anchors);
  const id = identity.id;
  if (!id) {
    return null;
  }

  const absX = toFiniteNumber(shape.x, 0);
  const absY = toFiniteNumber(shape.y, 0);
  const width = toPositiveNumber(shape.width, pageWidth);
  const height = toPositiveNumber(shape.height, 1);
  const baseName = identity.name;
  const background = extractFirstFill(shape)?.color;

  if (shape.type === "frame") {
    return {
      id,
      name: baseName,
      kind: baseName.trim().toLowerCase().replace(/\s+/g, "-") || "section",
      x: Math.max(0, absX),
      y: Math.max(0, absY),
      width,
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
    x: Math.max(0, absX),
    y: Math.max(0, absY),
    width,
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
  anchors: PenpotSemanticAnchorMap = {},
): ExecutableDesignDoc => {
  const existingNodeProps = new Map<string, DesignNode["props"] | undefined>();
  const existingNodes = new Map<string, DesignNode>();
  const visitExistingNodes = (nodes: DesignNode[]) => {
    for (const node of nodes) {
      existingNodes.set(node.id, node);
      existingNodeProps.set(node.id, node.props);
      if (Array.isArray(node.children) && node.children.length > 0) {
        visitExistingNodes(node.children);
      }
    }
  };
  for (const section of existingDocument?.sections || []) {
    visitExistingNodes(section.nodes);
  }

  const page = file.data?.pagesIndex?.[pageId];
  const objects = page?.objects || {};
  const rootShapeIds = getRootShapeIds(file, pageId);
  if (rootShapeIds.length === 0) {
    throw new Error("Penpot 页面为空，无法回写 design doc");
  }

  const missingSemanticShapes = rootShapeIds
    .map((shapeId) => objects[shapeId])
    .filter(
      (shape) =>
        shape && !getAnchorForShape(anchors, shape) && !parsePenpotSemanticName(shape.name),
    )
    .map((shape) =>
      getPenpotDisplayName(shape?.name, typeof shape?.id === "string" ? shape.id : "unknown"),
    );

  if (missingSemanticShapes.length > 0) {
    throw new Error(
      `Penpot 页面缺少语义标记，无法安全回写 design doc：${missingSemanticShapes.join(", ")}`,
    );
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
    anchors,
    existingNodeProps,
    existingNodes,
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
      ...(existingDocument?.page.theme ? { theme: existingDocument.page.theme } : {}),
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

import type { DesignDocSection, DesignNode } from "../designDocSchema";
import { buildLayoutTree, calculateTreeLayout, freeLayoutTree } from "./layout";
import {
  buildDeclarationText,
  extractPassthroughStyleDeclarations,
  extractStateStyleDeclarations,
  extractVendorStyleDeclarations,
} from "./styles";
import type { CompileContext, ComputedStyle, LayoutTreeNode, MarkupElement } from "./types";
import { normalizeWhitespace, toKebabCase } from "./utils";

const getElementId = (element: MarkupElement, ids: Set<string>, fallback: string) => {
  const base = toKebabCase(element.attributes.id || fallback) || fallback;
  let next = base;
  let counter = 2;
  while (ids.has(next)) {
    next = `${base}-${counter}`;
    counter += 1;
  }
  ids.add(next);
  return next;
};

const getElementName = (element: MarkupElement, fallback: string) => {
  if (element.tagName === "section") {
    return normalizeWhitespace(element.attributes.name || fallback);
  }
  return normalizeWhitespace(
    element.attributes.name ||
      element.attributes["data-placeholder"] ||
      element.attributes.value ||
      element.textContent ||
      fallback,
  );
};

const buildNodeProps = (
  element: MarkupElement,
  style: ComputedStyle,
): DesignNode["props"] | undefined => {
  const props: Record<string, unknown> = {};
  const controlType = normalizeWhitespace(element.attributes["data-control-type"] || "");
  const placeholder = normalizeWhitespace(element.attributes["data-placeholder"] || "");
  const value = element.attributes["data-value"] || "";
  const inputType = normalizeWhitespace(element.attributes["data-input-type"] || "");
  const rows = element.attributes["data-rows"];
  const selectedValue = element.attributes["data-selected-value"];
  const href = element.attributes["data-href"];
  const alt = element.attributes.alt;

  if (controlType) props.controlType = controlType;
  if (placeholder) props.placeholder = placeholder;
  if (value) props.value = value;
  if (inputType) props.inputType = inputType;
  if (rows) props.rows = Number.parseInt(rows, 10);
  if (selectedValue) props.selectedValue = selectedValue;
  if (element.attributes["data-disabled"] === "true") props.disabled = true;
  if (href) props.href = href;
  if (alt) props.alt = alt;
  if (element.attributes["data-preformatted"] === "true") props.preformatted = true;
  if (style.minWidth) {
    props.minWidth =
      style.minWidth.kind === "percent" ? `${style.minWidth.value}%` : `${style.minWidth.value}px`;
  }
  if (
    typeof style.aspectRatio === "number" &&
    Number.isFinite(style.aspectRatio) &&
    style.aspectRatio > 0
  ) {
    props.aspectRatio = String(style.aspectRatio);
  }
  if (style.flexGrow !== undefined) {
    props.flexGrow = String(style.flexGrow);
  }
  if (style.flexShrink !== undefined) {
    props.flexShrink = String(style.flexShrink);
  }
  if (style.flexBasis !== undefined) {
    props.flexBasis =
      style.flexBasis === "auto"
        ? "auto"
        : style.flexBasis.kind === "percent"
          ? `${style.flexBasis.value}%`
          : `${style.flexBasis.value}px`;
  }
  if (style.maxHeight) {
    props.maxHeight =
      style.maxHeight.kind === "percent"
        ? `${style.maxHeight.value}%`
        : `${style.maxHeight.value}px`;
  }
  if (element.tagName === "text") {
    props.textGrowType = "fixed";
  }
  if (style.fontFamily) props.fontFamily = style.fontFamily;
  if (style.fontStyle) props.fontStyle = style.fontStyle;
  if (style.textDecoration) props.textDecoration = style.textDecoration;
  if (style.verticalAlign) props.verticalAlign = style.verticalAlign;
  if (style.outline) props.outline = style.outline;
  if (style.backgroundSize) props.backgroundSize = style.backgroundSize;
  if (style.backgroundPosition) props.backgroundPosition = style.backgroundPosition;
  if (style.whiteSpace) props.whiteSpace = style.whiteSpace;
  if (style.textOverflow) props.textOverflow = style.textOverflow;
  if (style.listStyle) props.listStyle = style.listStyle;
  if (style.cursor) props.cursor = style.cursor;
  if (style.filter) props.filter = style.filter;
  if (style.transform) props.transform = style.transform;
  if (style.transition) props.transition = style.transition;
  if (style.animation) props.animation = style.animation;
  if (style.boxSizing) props.boxSizing = style.boxSizing;
  if (style.backdropFilter) props.backdropFilter = style.backdropFilter;
  if (style.overflow) props.overflow = style.overflow;
  if (style.overflowY) props.overflowY = style.overflowY;
  if (style.backgroundClip) props.backgroundClip = style.backgroundClip;
  if (style.webkitTextFillColor) props.webkitTextFillColor = style.webkitTextFillColor;
  for (const [key, value] of Object.entries(element.attributes)) {
    if (
      (key.startsWith("hover-") || key.startsWith("focus-") || key.startsWith("active-")) &&
      typeof value === "string" &&
      value.trim()
    ) {
      props[key] = value;
    }
  }
  for (const [key, value] of Object.entries(
    extractStateStyleDeclarations(buildDeclarationText(element.attributes)),
  )) {
    if (typeof value === "string" && value.trim()) {
      props[key] = value;
    }
  }
  for (const [key, value] of Object.entries(
    extractVendorStyleDeclarations(buildDeclarationText(element.attributes)),
  )) {
    if (typeof value === "string" && value.trim()) {
      props[key] = value;
    }
  }
  for (const [key, value] of Object.entries(
    extractPassthroughStyleDeclarations(buildDeclarationText(element.attributes)),
  )) {
    if (typeof value === "string" && value.trim()) {
      props[`css:${key}`] = value;
    }
  }

  return Object.keys(props).length > 0 ? props : undefined;
};

const buildNodeStyle = (
  element: MarkupElement,
  style: ComputedStyle,
): DesignNode["style"] | undefined => {
  const nodeStyle: DesignNode["style"] = {};
  if (style.backgroundImageUrl && element.tagName !== "text") {
    nodeStyle.fill = {
      type: "image",
      assetUrl: style.backgroundImageUrl,
    };
    if (style.backgroundColor) {
      nodeStyle.fills = [
        {
          type: "solid",
          color: style.backgroundColor,
          opacity: style.backgroundOpacity ?? style.opacity ?? 1,
        },
        {
          type: "image",
          assetUrl: style.backgroundImageUrl,
        },
      ];
    }
  } else if (style.backgroundColor && element.tagName !== "text") {
    nodeStyle.fill = {
      type: "solid",
      color: style.backgroundColor,
      opacity: style.backgroundOpacity ?? style.opacity ?? 1,
    };
  }
  if (style.borderColor && style.borderWidth !== undefined) {
    nodeStyle.stroke = {
      color: style.borderColor,
      width: style.borderWidth,
      opacity: style.opacity ?? 1,
    };
  }
  if (style.borderRadius !== undefined) {
    nodeStyle.radius = style.borderRadius;
  }
  if (style.opacity !== undefined && !nodeStyle.fill) {
    nodeStyle.opacity = style.opacity;
  }
  if (style.shadow) {
    nodeStyle.shadow = style.shadow;
  }
  if (style.color) {
    nodeStyle.textColor = style.color;
  }
  if (style.fontSize !== undefined) {
    nodeStyle.fontSize = style.fontSize;
  }
  if (style.fontWeight !== undefined) {
    nodeStyle.fontWeight = style.fontWeight;
  }
  if (style.letterSpacing !== undefined) {
    nodeStyle.letterSpacing = style.letterSpacing;
  }
  if (style.textAlign) {
    nodeStyle.align = style.textAlign;
  }

  return Object.keys(nodeStyle).length > 0 ? nodeStyle : undefined;
};

const hasBoxedTextStyle = (style: ComputedStyle) =>
  style.backgroundClip !== "text" &&
  (style.backgroundColor !== undefined ||
    style.backgroundImageUrl !== undefined ||
    style.padding !== undefined ||
    style.borderRadius !== undefined ||
    style.borderColor !== undefined ||
    style.borderWidth !== undefined ||
    style.shadow !== undefined ||
    style.opacity !== undefined);

const buildTextOnlyStyle = (style: ComputedStyle): DesignNode["style"] | undefined => {
  const textStyle: NonNullable<DesignNode["style"]> = {};
  textStyle.textColor = style.color || "#111111";
  if (style.fontSize !== undefined) {
    textStyle.fontSize = style.fontSize;
  }
  if (style.fontWeight !== undefined) {
    textStyle.fontWeight = style.fontWeight;
  }
  if (style.letterSpacing !== undefined) {
    textStyle.letterSpacing = style.letterSpacing;
  }
  textStyle.align = style.textAlign || "center";
  return Object.keys(textStyle).length > 0 ? textStyle : undefined;
};

const buildBoxOnlyStyle = (style: ComputedStyle): DesignNode["style"] | undefined => {
  const boxStyle: NonNullable<DesignNode["style"]> = {};
  if (style.backgroundImageUrl) {
    boxStyle.fill = {
      type: "image",
      assetUrl: style.backgroundImageUrl,
    };
    if (style.backgroundColor) {
      boxStyle.fills = [
        {
          type: "solid",
          color: style.backgroundColor,
          opacity: style.backgroundOpacity ?? style.opacity ?? 1,
        },
        {
          type: "image",
          assetUrl: style.backgroundImageUrl,
        },
      ];
    }
  } else if (style.backgroundColor) {
    boxStyle.fill = {
      type: "solid",
      color: style.backgroundColor,
      opacity: style.backgroundOpacity ?? style.opacity ?? 1,
    };
  }
  if (style.borderColor && style.borderWidth !== undefined) {
    boxStyle.stroke = {
      color: style.borderColor,
      width: style.borderWidth,
      opacity: style.opacity ?? 1,
    };
  }
  if (style.borderRadius !== undefined) {
    boxStyle.radius = style.borderRadius;
  }
  if (style.opacity !== undefined && !boxStyle.fill) {
    boxStyle.opacity = style.opacity;
  }
  if (style.shadow) {
    boxStyle.shadow = style.shadow;
  }
  return Object.keys(boxStyle).length > 0 ? boxStyle : undefined;
};

const buildTextOnlyProps = (
  element: MarkupElement,
  style: ComputedStyle,
): DesignNode["props"] | undefined => {
  const textProps: Record<string, unknown> = {
    textGrowType: "auto-height",
  };
  if (style.fontFamily) textProps.fontFamily = style.fontFamily;
  if (style.fontStyle) textProps.fontStyle = style.fontStyle;
  if (style.textDecoration) textProps.textDecoration = style.textDecoration;
  if (style.verticalAlign) textProps.verticalAlign = style.verticalAlign;
  if (style.textOverflow) textProps.textOverflow = style.textOverflow;
  if (style.boxSizing) textProps.boxSizing = style.boxSizing;
  if (style.webkitTextFillColor) textProps.webkitTextFillColor = style.webkitTextFillColor;
  if (style.backgroundClip) textProps.backgroundClip = style.backgroundClip;
  for (const [key, value] of Object.entries(
    extractVendorStyleDeclarations(buildDeclarationText(element.attributes)),
  )) {
    if (typeof value === "string" && value.trim()) {
      textProps[key] = value;
    }
  }
  for (const [key, value] of Object.entries(
    extractPassthroughStyleDeclarations(buildDeclarationText(element.attributes)),
  )) {
    if (typeof value === "string" && value.trim()) {
      textProps[`css:${key}`] = value;
    }
  }
  return Object.keys(textProps).length > 0 ? textProps : undefined;
};

const buildBoxOnlyProps = (
  element: MarkupElement,
  style: ComputedStyle,
): DesignNode["props"] | undefined => {
  const props: Record<string, unknown> = {};
  const href = element.attributes["data-href"];
  const alt = element.attributes.alt;
  if (href) props.href = href;
  if (alt) props.alt = alt;
  if (style.minWidth) {
    props.minWidth =
      style.minWidth.kind === "percent" ? `${style.minWidth.value}%` : `${style.minWidth.value}px`;
  }
  if (style.flexGrow !== undefined) {
    props.flexGrow = String(style.flexGrow);
  }
  if (style.flexShrink !== undefined) {
    props.flexShrink = String(style.flexShrink);
  }
  if (style.flexBasis !== undefined) {
    props.flexBasis =
      style.flexBasis === "auto"
        ? "auto"
        : style.flexBasis.kind === "percent"
          ? `${style.flexBasis.value}%`
          : `${style.flexBasis.value}px`;
  }
  if (style.maxHeight) {
    props.maxHeight =
      style.maxHeight.kind === "percent"
        ? `${style.maxHeight.value}%`
        : `${style.maxHeight.value}px`;
  }
  if (style.backgroundSize) props.backgroundSize = style.backgroundSize;
  if (style.backgroundPosition) props.backgroundPosition = style.backgroundPosition;
  if (style.cursor) props.cursor = style.cursor;
  if (style.filter) props.filter = style.filter;
  if (style.transform) props.transform = style.transform;
  if (style.transition) props.transition = style.transition;
  if (style.animation) props.animation = style.animation;
  if (style.boxSizing) props.boxSizing = style.boxSizing;
  if (style.backdropFilter) props.backdropFilter = style.backdropFilter;
  if (style.overflow) props.overflow = style.overflow;
  if (style.overflowY) props.overflowY = style.overflowY;
  for (const [key, value] of Object.entries(element.attributes)) {
    if (
      (key.startsWith("hover-") || key.startsWith("focus-") || key.startsWith("active-")) &&
      typeof value === "string" &&
      value.trim()
    ) {
      props[key] = value;
    }
  }
  for (const [key, value] of Object.entries(
    extractStateStyleDeclarations(buildDeclarationText(element.attributes)),
  )) {
    if (typeof value === "string" && value.trim()) {
      props[key] = value;
    }
  }
  for (const [key, value] of Object.entries(
    extractPassthroughStyleDeclarations(buildDeclarationText(element.attributes)),
  )) {
    if (typeof value === "string" && value.trim()) {
      props[`css:${key}`] = value;
    }
  }
  return Object.keys(props).length > 0 ? props : undefined;
};

const toDesignNode = (tree: LayoutTreeNode, context: CompileContext): DesignNode => {
  const layout = tree.yogaNode.getComputedLayout();
  const id = getElementId(
    tree.element,
    context.ids,
    `${tree.element.tagName}-${context.ids.size + 1}`,
  );
  const name = getElementName(tree.element, id);
  const style = buildNodeStyle(tree.element, tree.style);
  const props = buildNodeProps(tree.element, tree.style);

  if (tree.element.tagName === "text" && hasBoxedTextStyle(tree.style)) {
    const padding = tree.style.padding || { top: 0, right: 0, bottom: 0, left: 0 };
    const fontSize = tree.style.fontSize ?? 16;
    const lineHeight = Math.max(fontSize, Math.round(tree.style.lineHeight ?? fontSize * 1.4));
    const contentHeight = Math.max(1, Math.round(layout.height - padding.top - padding.bottom));
    const textHeight = Math.min(contentHeight, lineHeight);
    const textY = padding.top + Math.max(0, Math.round((contentHeight - textHeight) / 2));
    const textChildId = getElementId(
      {
        ...tree.element,
        attributes: {
          ...tree.element.attributes,
          id: `${id}-label`,
        },
      },
      context.ids,
      `${id}-label`,
    );
    const textChildStyle = buildTextOnlyStyle(tree.style) || {
      textColor: tree.style.color || "#111111",
    };
    if (!textChildStyle.align) {
      textChildStyle.align = "center";
    }
    return {
      id,
      name,
      type: "container",
      x: Math.round(layout.left),
      y: Math.round(layout.top),
      width: Math.max(1, Math.round(layout.width)),
      height: Math.max(1, Math.round(layout.height)),
      ...(typeof tree.style.zIndex === "number" ? { zIndex: tree.style.zIndex } : {}),
      ...(buildBoxOnlyProps(tree.element, tree.style)
        ? { props: buildBoxOnlyProps(tree.element, tree.style) }
        : {}),
      ...(buildBoxOnlyStyle(tree.style) ? { style: buildBoxOnlyStyle(tree.style) } : {}),
      children: [
        {
          id: textChildId,
          name,
          type: "text",
          x: padding.left,
          y: textY,
          width: Math.max(1, Math.round(layout.width - padding.left - padding.right)),
          height: Math.max(1, textHeight),
          text: tree.element.textContent || name,
          ...(buildTextOnlyProps(tree.element, tree.style)
            ? { props: buildTextOnlyProps(tree.element, tree.style) }
            : {}),
          style: textChildStyle,
        },
      ],
    };
  }

  if (tree.element.tagName === "text" || tree.element.tagName === "button") {
    return {
      id,
      name,
      type: tree.element.tagName === "button" ? "button" : "text",
      x: Math.round(layout.left),
      y: Math.round(layout.top),
      width: Math.max(1, Math.round(layout.width)),
      height: Math.max(1, Math.round(layout.height)),
      ...(typeof tree.style.zIndex === "number" ? { zIndex: tree.style.zIndex } : {}),
      text: tree.element.textContent || name,
      ...(props ? { props } : {}),
      ...(style ? { style } : {}),
    };
  }

  if (tree.element.tagName === "img") {
    return {
      id,
      name,
      type: "image",
      x: Math.round(layout.left),
      y: Math.round(layout.top),
      width: Math.max(1, Math.round(layout.width)),
      height: Math.max(1, Math.round(layout.height)),
      ...(typeof tree.style.zIndex === "number" ? { zIndex: tree.style.zIndex } : {}),
      assetUrl:
        tree.element.attributes.src ||
        tree.element.attributes.asseturl ||
        "https://example.com/image.png",
      imageFit: tree.style.objectFit || "cover",
      ...(props ? { props } : {}),
      ...(style ? { style } : {}),
    };
  }

  if (tree.element.tagName === "shape") {
    const shapeType = (
      tree.element.attributes.kind ||
      tree.element.attributes.type ||
      ""
    ).toLowerCase();
    return {
      id,
      name,
      type: "shape",
      x: Math.round(layout.left),
      y: Math.round(layout.top),
      width: Math.max(1, Math.round(layout.width)),
      height: Math.max(1, Math.round(layout.height)),
      ...(typeof tree.style.zIndex === "number" ? { zIndex: tree.style.zIndex } : {}),
      shapeKind:
        shapeType === "circle" || shapeType === "ellipse"
          ? "ellipse"
          : shapeType === "line"
            ? "line"
            : "rect",
      ...(props ? { props } : {}),
      ...(style ? { style } : {}),
    };
  }

  return {
    id,
    name,
    type: "container",
    x: Math.round(layout.left),
    y: Math.round(layout.top),
    width: Math.max(1, Math.round(layout.width)),
    height: Math.max(1, Math.round(layout.height)),
    ...(typeof tree.style.zIndex === "number" ? { zIndex: tree.style.zIndex } : {}),
    ...(props ? { props } : {}),
    ...(style ? { style } : {}),
    ...(tree.children.length > 0
      ? {
          children: tree.children.map((child) => toDesignNode(child, context)),
        }
      : {}),
  };
};

export const compileSection = (
  element: MarkupElement,
  pageWidth: number,
  startY: number,
  context: CompileContext,
): DesignDocSection => {
  const wrapper = buildLayoutTree({
    tagName: "page",
    attributes: {
      width: String(pageWidth),
    },
    children: [element],
    textContent: "",
  });
  calculateTreeLayout(wrapper, pageWidth);
  const tree = wrapper.children[0];
  const layout = tree?.yogaNode.getComputedLayout() || { left: 0, width: pageWidth, height: 1 };
  const sectionId = getElementId(element, context.ids, `section-${context.ids.size + 1}`);
  const sectionName = getElementName(element, sectionId);
  const section = {
    id: sectionId,
    name: sectionName,
    kind: element.attributes.kind || "content",
    x: Math.max(0, Math.round(layout.left)),
    y: startY,
    width: Math.max(1, Math.round(layout.width)),
    height: Math.max(1, Math.round(layout.height)),
    ...(tree.style.backgroundColor ? { background: tree.style.backgroundColor } : {}),
    layout: {
      mode: "absolute" as const,
    },
    nodes: (tree?.children || []).map((child) => toDesignNode(child, context)),
  } satisfies DesignDocSection;
  freeLayoutTree(wrapper);
  return section;
};

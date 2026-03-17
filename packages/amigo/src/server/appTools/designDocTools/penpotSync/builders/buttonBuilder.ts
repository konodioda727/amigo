import { createStablePenpotUuid } from "../shared";
import {
  applyComponentInstanceAttrs,
  buildTextStyle,
  createFrameShape,
  createTextShape,
  getCurrentComponentSourceShapeId,
  getShadowSpec,
  getSolidFillColor,
  getSyntheticComponentSourceShapeId,
  toPenpotShadow,
} from "./helpers";
import type { NodeBuilderContext } from "./types";

export const buildButtonNode = ({
  document,
  node,
  nodeId,
  nodeName,
  nodeSeed,
  pageId,
  frameId,
  parentId,
  absoluteX,
  absoluteY,
  style,
  changes,
  anchors,
  activeComponentInstance,
}: NodeBuilderContext) => {
  const background = getSolidFillColor(style) || document.designTokens.colors.primary || "#111111";
  const radius = typeof style?.radius === "number" ? style.radius : 12;
  const shadow = getShadowSpec(style);
  const childChanges: Record<string, unknown>[] = [];
  const childIds: string[] = [];

  const textId = createStablePenpotUuid(`${nodeSeed}:label`);
  anchors[textId] = {
    entityType: "node",
    semanticId: `${node.id}__label`,
    displayName: `${node.name} Label`,
  };
  const textStyle = buildTextStyle(document, style, "body");
  childIds.push(textId);
  const labelHeight = Math.min(
    Math.max(
      Math.round(textStyle.lineHeight || textStyle.fontSize * 1.4),
      Math.round(textStyle.fontSize),
    ),
    Math.max(Math.round(textStyle.fontSize), node.height),
  );
  const labelY = Math.max(0, Math.round((node.height - labelHeight) / 2));
  childChanges.push({
    type: "add-obj",
    id: textId,
    "page-id": pageId,
    "frame-id": nodeId,
    "parent-id": nodeId,
    obj: applyComponentInstanceAttrs(
      createTextShape(
        textId,
        `${node.name} Label`,
        0,
        labelY,
        node.width,
        labelHeight,
        nodeId,
        nodeId,
        node.text || node.name,
        {
          ...textStyle,
          align: "center",
          color:
            typeof style?.textColor === "string"
              ? style.textColor
              : document.designTokens.colors.background || "#FFFFFF",
        },
        absoluteX,
        absoluteY + labelY,
        "auto-height",
      ),
      activeComponentInstance,
      getSyntheticComponentSourceShapeId(activeComponentInstance, "label"),
    ),
  });

  changes.push({
    type: "add-obj",
    id: nodeId,
    "page-id": pageId,
    "frame-id": frameId,
    "parent-id": parentId,
    obj: applyComponentInstanceAttrs(
      createFrameShape(
        nodeId,
        nodeName,
        node.x,
        node.y,
        node.width,
        node.height,
        parentId,
        frameId,
        background,
        absoluteX,
        absoluteY,
        childIds,
        radius,
        shadow ? toPenpotShadow(nodeSeed, shadow) : undefined,
      ),
      activeComponentInstance,
      getCurrentComponentSourceShapeId(activeComponentInstance),
      Boolean(activeComponentInstance && node.id === activeComponentInstance.rootTargetNodeId),
    ),
  });
  changes.push(...childChanges);
  return [nodeId];
};

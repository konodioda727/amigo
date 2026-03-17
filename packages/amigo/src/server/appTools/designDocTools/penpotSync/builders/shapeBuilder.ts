import {
  applyComponentInstanceAttrs,
  createRectShape,
  getCurrentComponentSourceShapeId,
  getShadowSpec,
  getSolidFillColor,
  toPenpotShadow,
} from "./helpers";
import type { NodeBuilderContext } from "./types";

export const buildShapeNode = ({
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
  activeComponentInstance,
}: NodeBuilderContext) => {
  const fallbackColor =
    getSolidFillColor(style) || document.designTokens.colors.primary || "#111111";
  const shapeKind = node.shapeKind || "rect";
  const radius =
    shapeKind === "ellipse"
      ? Math.min(node.width, node.height) / 2
      : typeof style?.radius === "number"
        ? style.radius
        : 0;
  const width = shapeKind === "line" ? Math.max(node.width, 1) : node.width;
  const height = shapeKind === "line" ? Math.max(node.height, 1) : node.height;
  const shadow = getShadowSpec(style);

  changes.push({
    type: "add-obj",
    id: nodeId,
    "page-id": pageId,
    "frame-id": frameId,
    "parent-id": parentId,
    obj: applyComponentInstanceAttrs(
      createRectShape(
        nodeId,
        nodeName,
        node.x,
        node.y,
        width,
        height,
        parentId,
        frameId,
        fallbackColor,
        radius,
        absoluteX,
        absoluteY,
        shadow ? toPenpotShadow(nodeSeed, shadow) : undefined,
      ),
      activeComponentInstance,
      getCurrentComponentSourceShapeId(activeComponentInstance),
      Boolean(activeComponentInstance && node.id === activeComponentInstance.rootTargetNodeId),
    ),
  });
  return [nodeId];
};

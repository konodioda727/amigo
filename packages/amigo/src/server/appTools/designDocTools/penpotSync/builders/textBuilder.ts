import {
  applyComponentInstanceAttrs,
  buildTextStyle,
  createTextShape,
  getCurrentComponentSourceShapeId,
} from "./helpers";
import type { NodeBuilderContext } from "./types";

export const buildTextNode = ({
  document,
  node,
  nodeId,
  nodeName,
  pageId,
  frameId,
  parentId,
  absoluteX,
  absoluteY,
  style,
  changes,
  activeComponentInstance,
}: NodeBuilderContext) => {
  const textStyle = buildTextStyle(document, style, "body");
  const growType =
    node.props?.textGrowType === "auto-width" || node.props?.textGrowType === "auto-height"
      ? node.props.textGrowType
      : "fixed";
  changes.push({
    type: "add-obj",
    id: nodeId,
    "page-id": pageId,
    "frame-id": frameId,
    "parent-id": parentId,
    obj: applyComponentInstanceAttrs(
      createTextShape(
        nodeId,
        nodeName,
        node.x,
        node.y,
        node.width,
        node.height,
        parentId,
        frameId,
        node.text || node.name,
        textStyle,
        absoluteX,
        absoluteY,
        growType,
      ),
      activeComponentInstance,
      getCurrentComponentSourceShapeId(activeComponentInstance),
      Boolean(activeComponentInstance && node.id === activeComponentInstance.rootTargetNodeId),
    ),
  });
  return [nodeId];
};

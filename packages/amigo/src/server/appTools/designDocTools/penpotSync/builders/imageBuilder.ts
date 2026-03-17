import {
  applyComponentInstanceAttrs,
  createImageRectShape,
  createRectShape,
  getCurrentComponentSourceShapeId,
} from "./helpers";
import type { NodeBuilderContext } from "./types";

export const buildImageNode = ({
  document,
  node,
  nodeId,
  nodeName,
  pageId,
  frameId,
  parentId,
  absoluteX,
  absoluteY,
  changes,
  anchors,
  mediaObjectsByAssetUrl,
  activeComponentInstance,
}: NodeBuilderContext) => {
  anchors[nodeId] = {
    entityType: "node",
    semanticId: node.id,
    displayName: node.name,
    nodeType: "image",
    ...(typeof node.assetUrl === "string" ? { assetUrl: node.assetUrl } : {}),
    ...(typeof node.imageFit === "string" ? { imageFit: node.imageFit } : {}),
  };

  const mediaObject =
    typeof node.assetUrl === "string" ? mediaObjectsByAssetUrl?.[node.assetUrl] : undefined;

  changes.push({
    type: "add-obj",
    id: nodeId,
    "page-id": pageId,
    "frame-id": frameId,
    "parent-id": parentId,
    obj: applyComponentInstanceAttrs(
      mediaObject
        ? createImageRectShape(
            nodeId,
            nodeName,
            node.x,
            node.y,
            node.width,
            node.height,
            parentId,
            frameId,
            mediaObject,
            typeof node.style?.radius === "number" ? node.style.radius : 16,
            absoluteX,
            absoluteY,
          )
        : createRectShape(
            nodeId,
            nodeName,
            node.x,
            node.y,
            node.width,
            node.height,
            parentId,
            frameId,
            document.designTokens.colors.surface || "#E5E7EB",
            typeof node.style?.radius === "number" ? node.style.radius : 16,
            absoluteX,
            absoluteY,
          ),
      activeComponentInstance,
      getCurrentComponentSourceShapeId(activeComponentInstance),
      Boolean(activeComponentInstance && node.id === activeComponentInstance.rootTargetNodeId),
    ),
  });
  return [nodeId];
};

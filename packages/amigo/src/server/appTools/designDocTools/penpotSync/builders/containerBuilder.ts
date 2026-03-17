import { sortNodesByZIndex } from "../shared";
import {
  appendImageFillPlaceholder,
  applyComponentInstanceAttrs,
  createFrameShape,
  getCurrentComponentSourceShapeId,
  getImageFillUrl,
  getShadowSpec,
  getSolidFillColor,
  getSyntheticComponentSourceShapeId,
  toPenpotFill,
  toPenpotImageFill,
  toPenpotShadow,
} from "./helpers";
import type { NodeBuilderContext } from "./types";

export const buildContainerNode = ({
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
  mediaObjectsByAssetUrl,
  componentBindingsByRef,
  activeComponentInstance,
  appendNodeChanges,
}: NodeBuilderContext) => {
  const background = getSolidFillColor(style);
  const imageFillUrl = getImageFillUrl(style);
  const imageMediaObject =
    typeof imageFillUrl === "string" ? mediaObjectsByAssetUrl?.[imageFillUrl] : undefined;
  const shadow = getShadowSpec(style);
  const radius = typeof style?.radius === "number" ? style.radius : 0;
  const childChanges: Record<string, unknown>[] = [];
  const childIds: string[] = [];

  for (const child of sortNodesByZIndex(node.children || [])) {
    childIds.push(
      ...appendNodeChanges({
        document,
        node: child,
        pageId,
        frameId: nodeId,
        parentId: nodeId,
        parentAbsoluteX: absoluteX,
        parentAbsoluteY: absoluteY,
        changes: childChanges,
        semanticPath: nodeSeed,
        anchors,
        mediaObjectsByAssetUrl,
        componentBindingsByRef,
        activeComponentInstance,
      }),
    );
  }
  const fillsOverride =
    imageMediaObject && background
      ? [...toPenpotFill(background), ...toPenpotImageFill(imageMediaObject)]
      : imageMediaObject
        ? toPenpotImageFill(imageMediaObject)
        : undefined;

  if (imageFillUrl && !imageMediaObject) {
    childIds.unshift(
      ...appendImageFillPlaceholder(
        childChanges,
        pageId,
        nodeId,
        nodeId,
        absoluteX,
        absoluteY,
        nodeSeed,
        nodeName,
        0,
        0,
        node.width,
        node.height,
        radius,
        imageFillUrl,
        mediaObjectsByAssetUrl?.[imageFillUrl],
        getSyntheticComponentSourceShapeId(activeComponentInstance, "bg-image"),
        getSyntheticComponentSourceShapeId(activeComponentInstance, "bg-image-label"),
      ),
    );
  }

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
        fillsOverride,
      ),
      activeComponentInstance,
      getCurrentComponentSourceShapeId(activeComponentInstance),
      Boolean(activeComponentInstance && node.id === activeComponentInstance.rootTargetNodeId),
    ),
  });

  changes.push(...childChanges);
  return [nodeId];
};

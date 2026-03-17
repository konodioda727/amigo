import { createStablePenpotUuid, isPlainObject } from "../shared";
import { buildButtonNode } from "./buttonBuilder";
import { buildContainerNode } from "./containerBuilder";
import { getImageFillUrl } from "./helpers";
import { buildImageNode } from "./imageBuilder";
import { buildShapeNode } from "./shapeBuilder";
import { buildTextNode } from "./textBuilder";
import type { AppendNodeChanges, AppendNodeChangesContext } from "./types";

export { createFrameShape } from "./helpers";

export const appendNodeChanges: AppendNodeChanges = ({
  document,
  node,
  pageId,
  frameId,
  parentId,
  parentAbsoluteX,
  parentAbsoluteY,
  changes,
  semanticPath,
  anchors,
  mediaObjectsByAssetUrl,
  componentBindingsByRef,
  activeComponentInstance: parentActiveComponentInstance,
}: AppendNodeChangesContext) => {
  const nodeSeed = `${semanticPath}/${node.id}`;
  const nodeId = createStablePenpotUuid(nodeSeed);
  const style = isPlainObject(node.style) ? node.style : undefined;
  const absoluteX = parentAbsoluteX + node.x;
  const absoluteY = parentAbsoluteY + node.y;
  const nodeName = node.name;
  const componentRef =
    typeof node.props?.componentRef === "string" ? node.props.componentRef : undefined;
  const componentBinding = componentRef ? componentBindingsByRef?.[componentRef] : undefined;
  const activeComponentInstance = componentBinding
    ? {
        binding: componentBinding,
        rootTargetNodeId: node.id,
        sourceRootNodeId: componentBinding.sourceInstanceNodeId,
        currentSourceNodeSeed: `${componentBinding.sourceParentSeed}/${componentBinding.sourceInstanceNodeId}`,
      }
    : parentActiveComponentInstance
      ? (() => {
          const currentSourceNodeId =
            node.id === parentActiveComponentInstance.rootTargetNodeId
              ? parentActiveComponentInstance.sourceRootNodeId
              : node.id.startsWith(`${parentActiveComponentInstance.rootTargetNodeId}--`)
                ? `${parentActiveComponentInstance.sourceRootNodeId}${node.id.slice(parentActiveComponentInstance.rootTargetNodeId.length)}`
                : null;

          if (!currentSourceNodeId) {
            return undefined;
          }

          return {
            ...parentActiveComponentInstance,
            currentSourceNodeSeed: `${parentActiveComponentInstance.currentSourceNodeSeed}/${currentSourceNodeId}`,
          };
        })()
      : undefined;
  anchors[nodeId] = {
    entityType: "node",
    semanticId: node.id,
    displayName: node.name,
    ...(typeof getImageFillUrl(style) === "string" ? { assetUrl: getImageFillUrl(style) } : {}),
  };

  const context = {
    document,
    node,
    nodeId,
    nodeName,
    nodeSeed,
    pageId,
    frameId,
    parentId,
    parentAbsoluteX,
    parentAbsoluteY,
    absoluteX,
    absoluteY,
    style,
    changes,
    semanticPath,
    anchors,
    mediaObjectsByAssetUrl,
    componentBindingsByRef,
    activeComponentInstance,
    appendNodeChanges,
  };

  switch (node.type) {
    case "container":
      return buildContainerNode(context);
    case "text":
      return buildTextNode(context);
    case "button":
      return buildButtonNode(context);
    case "image":
      return buildImageNode(context);
    default:
      return buildShapeNode(context);
  }
};

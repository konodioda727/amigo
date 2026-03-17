import type { ExecutableDesignDoc } from "../../designDocSchema";
import type { PenpotComponentBinding } from "../../penpotBindings";
import type { PenpotMediaObject, PenpotSemanticAnchorMap } from "../types";

export type PenpotChange = Record<string, unknown>;
export type DesignNode = ExecutableDesignDoc["sections"][number]["nodes"][number];

export interface AppendNodeChangesContext {
  document: ExecutableDesignDoc;
  node: DesignNode;
  pageId: string;
  frameId: string;
  parentId: string;
  parentAbsoluteX: number;
  parentAbsoluteY: number;
  changes: PenpotChange[];
  semanticPath: string;
  anchors: PenpotSemanticAnchorMap;
  mediaObjectsByAssetUrl?: Record<string, PenpotMediaObject>;
  componentBindingsByRef?: Record<string, PenpotComponentBinding>;
  activeComponentInstance?: ActiveComponentInstance;
}

export type AppendNodeChanges = (context: AppendNodeChangesContext) => string[];

export interface NodeBuilderContext extends AppendNodeChangesContext {
  nodeId: string;
  nodeName: string;
  nodeSeed: string;
  absoluteX: number;
  absoluteY: number;
  style: Record<string, unknown> | undefined;
  appendNodeChanges: AppendNodeChanges;
}

export interface ActiveComponentInstance {
  binding: PenpotComponentBinding;
  rootTargetNodeId: string;
  sourceRootNodeId: string;
  currentSourceNodeSeed: string;
}

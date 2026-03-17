import type { ExecutableDesignDoc } from "../designDocSchema";

export const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export interface PenpotSyncConfig {
  baseUrl: string;
  accessToken: string;
  teamId: string;
  projectId: string;
}

export interface PenpotRpcFile {
  id: string;
  revn: number;
  vern: number;
  data?: {
    pages?: string[];
    pagesIndex?: Record<
      string,
      {
        id?: string;
        name?: string;
        background?: string;
        objects?: Record<string, PenpotRpcShape>;
      }
    >;
    components?: Record<
      string,
      {
        id?: string;
        name?: string;
        path?: string;
        "main-instance-id"?: string;
        "main-instance-page"?: string;
        mainInstanceId?: string;
        mainInstancePage?: string;
      }
    >;
  };
}

export interface PenpotSyncResult {
  fileId: string;
  pageId: string;
  projectId: string;
  teamId: string;
  fileUrl: string;
}

export interface PenpotSemanticAnchor {
  entityType: "section" | "node";
  semanticId: string;
  displayName: string;
  nodeType?: DesignNode["type"];
  assetUrl?: string;
  imageFit?: DesignNode["imageFit"];
}

export type PenpotSemanticAnchorMap = Record<string, PenpotSemanticAnchor>;

export interface PenpotMediaObject {
  id: string;
  width: number;
  height: number;
  mtype: string;
  mediaId?: string;
  thumbnailId?: string;
  name?: string;
  isLocal?: boolean;
  createdAt?: string;
}

export interface PenpotTextStyle {
  color: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing?: number;
  align?: "left" | "center" | "right";
}

export interface PenpotPositionData {
  x: number;
  y: number;
  width: number;
  height: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  fontStyle: string;
  textTransform: string;
  fontSize: string;
  fontWeight: string;
  lineHeight?: string;
  textDecoration: string;
  letterSpacing: string;
  fills: Array<Record<string, unknown>>;
  direction: string;
  fontFamily: string;
  text: string;
  textAlign?: string;
}

export interface PenpotRpcFill {
  "fill-color"?: string;
  "fill-opacity"?: number;
  fillColor?: string;
  fillOpacity?: number;
  "fill-image"?: {
    id?: string;
    width?: number;
    height?: number;
    mtype?: string;
    keepAspectRatio?: boolean;
  };
  fillImage?: {
    id?: string;
    width?: number;
    height?: number;
    mtype?: string;
    keepAspectRatio?: boolean;
  };
}

export interface PenpotRpcStroke {
  "stroke-color"?: string;
  "stroke-width"?: number;
  "stroke-opacity"?: number;
}

export interface PenpotRpcColor {
  color?: string;
  opacity?: number;
}

export interface PenpotRpcShadow {
  id?: string | null;
  style?: "drop-shadow" | "inner-shadow";
  offsetX?: number;
  offsetY?: number;
  blur?: number;
  spread?: number;
  hidden?: boolean;
  color?: PenpotRpcColor;
}

export interface PenpotRpcTextContent {
  text?: string;
  fills?: Array<Record<string, unknown>>;
  children?: PenpotRpcTextContent[];
  "font-family"?: string;
  "font-size"?: string | number;
  "font-weight"?: string | number;
  "line-height"?: string | number;
  "letter-spacing"?: string | number;
  "text-align"?: string;
}

export interface PenpotRpcShape {
  id?: string;
  name?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  shapes?: string[];
  fills?: PenpotRpcFill[];
  strokes?: PenpotRpcStroke[];
  shadow?: PenpotRpcShadow[];
  content?: PenpotRpcTextContent;
  positionData?: PenpotPositionData[];
  hidden?: boolean;
  r1?: number;
  r2?: number;
  r3?: number;
  r4?: number;
  background?: string;
  "component-id"?: string;
  "component-file"?: string;
  "component-root"?: boolean;
  "main-instance"?: boolean;
  "shape-ref"?: string;
  componentId?: string;
  componentFile?: string;
  componentRoot?: boolean;
  mainInstance?: boolean;
  shapeRef?: string;
}

export type DesignSection = ExecutableDesignDoc["sections"][number];
export type DesignNode = DesignSection["nodes"][number];

export interface PenpotRemoteState {
  remoteRevision: number | null;
  remoteVersion: number | null;
  lastForwardSyncRevision: number | null;
  lastReverseSyncRevision: number | null;
  lastReverseSyncedAt: string | null;
  hasRemoteChanges: boolean;
}

export interface PenpotTypographyStyle {
  color: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing?: number;
  align?: "left" | "center" | "right";
}

export interface PenpotImportContext {
  objects: Record<string, PenpotRpcShape>;
  anchors: PenpotSemanticAnchorMap;
  existingNodeProps: Map<string, DesignNode["props"] | undefined>;
  existingNodes: Map<string, DesignNode>;
  typography: ExecutableDesignDoc["designTokens"]["typography"];
  typographyIndex: Map<string, string>;
  colorHints: {
    textPrimary?: string;
    textSecondary?: string;
    surface?: string;
    primary?: string;
  };
}

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
  };
}

export interface PenpotSyncResult {
  fileId: string;
  pageId: string;
  projectId: string;
  teamId: string;
  fileUrl: string;
}

export interface PenpotTextStyle {
  color: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
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
  textDecoration: string;
  letterSpacing: string;
  fills: Array<Record<string, unknown>>;
  direction: string;
  fontFamily: string;
  text: string;
}

export interface PenpotRpcFill {
  "fill-color"?: string;
  "fill-opacity"?: number;
}

export interface PenpotRpcStroke {
  "stroke-color"?: string;
  "stroke-width"?: number;
  "stroke-opacity"?: number;
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
  content?: PenpotRpcTextContent;
  positionData?: PenpotPositionData[];
  hidden?: boolean;
  r1?: number;
  r2?: number;
  r3?: number;
  r4?: number;
  background?: string;
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
}

export interface PenpotImportContext {
  objects: Record<string, PenpotRpcShape>;
  typography: ExecutableDesignDoc["designTokens"]["typography"];
  typographyIndex: Map<string, string>;
  colorHints: {
    textPrimary?: string;
    textSecondary?: string;
    surface?: string;
    primary?: string;
  };
}

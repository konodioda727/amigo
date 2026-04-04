import type { Node as YogaNode } from "yoga-layout";

export type MarkupTag =
  | "page"
  | "section"
  | "div"
  | "text"
  | "button"
  | "img"
  | "br"
  | "shape"
  | "input"
  | "textarea"
  | "select"
  | "option";

export interface MarkupElement {
  tagName: MarkupTag;
  attributes: Record<string, string>;
  children: MarkupElement[];
  textContent: string;
}

export interface LengthValue {
  kind: "px" | "percent";
  value: number;
}

export type GridTrack =
  | {
      kind: "fr";
      value: number;
    }
  | {
      kind: "length";
      value: LengthValue;
    };

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type MarginValue = LengthValue | "auto";

export interface Margins {
  top: MarginValue;
  right: MarginValue;
  bottom: MarginValue;
  left: MarginValue;
}

export interface ComputedStyle {
  width?: LengthValue;
  aspectRatio?: number;
  minWidth?: LengthValue;
  height?: LengthValue;
  minHeight?: LengthValue;
  maxHeight?: LengthValue;
  maxWidth?: LengthValue;
  padding?: Insets;
  gap?: number;
  rowGap?: number;
  columnGap?: number;
  display?: string;
  flexDirection?: "row" | "column";
  flex?: number;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: LengthValue | "auto";
  flexWrap?: "wrap" | "nowrap";
  justifyContent?: string;
  alignItems?: string;
  verticalAlign?: string;
  margin?: Margins;
  backgroundColor?: string;
  backgroundOpacity?: number;
  backgroundImageUrl?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  color?: string;
  borderRadius?: number;
  borderColor?: string;
  borderWidth?: number;
  outline?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  fontFamily?: string;
  letterSpacing?: number;
  textDecoration?: string;
  lineHeight?: number;
  textAlign?: "left" | "center" | "right";
  whiteSpace?: string;
  textOverflow?: string;
  listStyle?: string;
  opacity?: number;
  objectFit?: "cover" | "contain" | "fill";
  gridColumns?: number;
  gridTemplateColumns?: GridTrack[];
  cursor?: string;
  filter?: string;
  transform?: string;
  transition?: string;
  animation?: string;
  boxSizing?: string;
  backdropFilter?: string;
  backgroundClip?: string;
  webkitTextFillColor?: string;
  overflow?: string;
  overflowY?: string;
  position?: "relative" | "absolute";
  top?: LengthValue;
  right?: LengthValue;
  bottom?: LengthValue;
  left?: LengthValue;
  zIndex?: number;
  shadow?: {
    x: number;
    y: number;
    blur: number;
    color: string;
    opacity?: number;
  };
}

export interface LayoutTreeNode {
  element: MarkupElement;
  style: ComputedStyle;
  yogaNode: YogaNode;
  children: LayoutTreeNode[];
}

export interface CompileContext {
  ids: Set<string>;
}

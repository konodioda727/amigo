import type { ChildNode, DataNode, Node as DomNode, Element } from "domhandler";
import { parseDocument } from "htmlparser2";
import { SUPPORTED_TAGS } from "./constants";
import { computeStyle, validateAttributes } from "./styles";
import type { GridTrack, MarkupElement, MarkupTag } from "./types";
import {
  appendStyleDeclaration,
  chunkArray,
  normalizeTextPreservingBreaks,
  normalizeWhitespace,
  parseNumber,
} from "./utils";

const RAW_TEXT_TAGS = new Set([
  "p",
  "span",
  "label",
  "small",
  "strong",
  "em",
  "b",
  "i",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "pre",
]);
const RAW_CONTAINER_TAGS = new Set([
  "header",
  "footer",
  "main",
  "nav",
  "article",
  "aside",
  "form",
  "ul",
  "ol",
  "li",
]);

const isTextNode = (node: DomNode): node is DataNode => node.type === "text";
const isElementNode = (node: DomNode): node is Element => node.type === "tag";

const getDefaultStyleForRawTag = (rawTagName: string) => {
  switch (rawTagName) {
    case "h1":
      return "font-size:48px;font-weight:700;line-height:56px";
    case "h2":
      return "font-size:40px;font-weight:700;line-height:48px";
    case "h3":
      return "font-size:32px;font-weight:700;line-height:40px";
    case "h4":
      return "font-size:28px;font-weight:600;line-height:36px";
    case "h5":
      return "font-size:24px;font-weight:600;line-height:32px";
    case "h6":
      return "font-size:20px;font-weight:600;line-height:28px";
    case "label":
      return "font-size:14px;font-weight:600;line-height:20px";
    case "pre":
      return "font-size:14px;line-height:22px;font-family:monospace";
    case "small":
      return "font-size:14px;line-height:20px";
    case "strong":
    case "b":
      return "font-weight:700";
    case "em":
    case "i":
      return "font-style:italic";
    default:
      return "";
  }
};

const normalizeRawTagName = (rawTagName: string): MarkupTag => {
  if (RAW_TEXT_TAGS.has(rawTagName)) {
    return "text";
  }
  if (RAW_CONTAINER_TAGS.has(rawTagName)) {
    return "div";
  }
  return rawTagName as MarkupTag;
};

const collectTextContent = (children: ChildNode[]): string =>
  normalizeTextPreservingBreaks(
    children
      .map((child) => {
        if (isTextNode(child)) {
          return child.data || "";
        }
        if (isElementNode(child)) {
          if (child.name.toLowerCase() === "br") {
            return "\n";
          }
          return collectTextContent(child.children || []);
        }
        return "";
      })
      .join(""),
  );

const collectPreformattedTextContent = (children: ChildNode[]): string =>
  children
    .map((child) => {
      if (isTextNode(child)) {
        return (child.data || "").replace(/\r\n?/g, "\n");
      }
      if (isElementNode(child)) {
        if (child.name.toLowerCase() === "br") {
          return "\n";
        }
        return collectPreformattedTextContent(child.children || []);
      }
      return "";
    })
    .join("");

const cloneMarkupElement = (element: MarkupElement): MarkupElement => ({
  tagName: element.tagName,
  attributes: { ...element.attributes },
  children: element.children.map(cloneMarkupElement),
  textContent: element.textContent,
});

const shouldRepresentAsText = (
  rawTagName: string,
  tagName: MarkupTag,
  childElements: Element[],
  textContent: string,
) => {
  if (!textContent.trim() || childElements.length > 0) {
    return false;
  }

  if (tagName === "text") {
    return true;
  }

  if (tagName !== "div") {
    return false;
  }

  if (rawTagName !== "div" && !RAW_CONTAINER_TAGS.has(rawTagName)) {
    return false;
  }

  return true;
};

const toMarkupElement = (node: Element): MarkupElement => {
  const rawTagName = node.name.toLowerCase();
  const tagName = normalizeRawTagName(rawTagName);
  if (!SUPPORTED_TAGS.has(tagName)) {
    throw new Error(`不支持的标签: <${rawTagName}>`);
  }

  const rawAttributes = Object.fromEntries(
    Object.entries(node.attribs || {}).map(([key, value]) => [key.toLowerCase(), String(value)]),
  ) as Record<string, string>;

  if (rawTagName === "a" && typeof rawAttributes.href === "string") {
    rawAttributes["data-href"] = rawAttributes.href;
    delete rawAttributes.href;
  }
  if (rawTagName === "pre") {
    rawAttributes["data-preformatted"] = "true";
  }

  rawAttributes.style = appendStyleDeclaration(
    getDefaultStyleForRawTag(rawTagName),
    rawAttributes.style,
  );

  const childElements = (node.children || []).filter(isElementNode);
  const textContent =
    rawTagName === "pre"
      ? collectPreformattedTextContent(node.children || [])
      : collectTextContent(node.children || []);

  if (shouldRepresentAsText(rawTagName, tagName, childElements, textContent)) {
    return {
      tagName: "text",
      attributes: rawAttributes,
      children: [],
      textContent,
    };
  }

  const shouldKeepChildren =
    tagName === "page" ||
    tagName === "section" ||
    tagName === "div" ||
    tagName === "textarea" ||
    tagName === "input" ||
    tagName === "select";

  return {
    tagName,
    attributes: rawAttributes,
    children: shouldKeepChildren ? childElements.map(toMarkupElement) : [],
    textContent,
  };
};

const buildControlElement = (element: MarkupElement): MarkupElement => {
  const controlType = element.tagName;
  const selectedOption =
    controlType === "select"
      ? element.children.find(
          (child) =>
            child.tagName === "option" &&
            (child.attributes.selected !== undefined ||
              (element.attributes.value && child.attributes.value === element.attributes.value)),
        ) || element.children.find((child) => child.tagName === "option")
      : null;
  const textValue =
    normalizeTextPreservingBreaks(
      controlType === "select" ? selectedOption?.textContent || "" : element.attributes.value || "",
    ) ||
    normalizeTextPreservingBreaks(element.textContent || "") ||
    normalizeTextPreservingBreaks(element.attributes.placeholder || "");
  const placeholder = normalizeWhitespace(element.attributes.placeholder || "");
  const rows = Math.max(2, parseNumber(element.attributes.rows) || 4);
  const inputHeight = controlType === "textarea" ? rows * 24 + 24 : 44;
  const controlStyle = appendStyleDeclaration(
    element.attributes.style,
    controlType === "textarea"
      ? `display:flex;flex-direction:column;padding:12px 14px;border:1px solid #D1D5DB;border-radius:8px;background:#FFFFFF;height:${inputHeight}px`
      : "display:flex;flex-direction:column;justify-content:center;padding:12px 14px;border:1px solid #D1D5DB;border-radius:8px;background:#FFFFFF;height:44px",
  );

  const textChild: MarkupElement | null = textValue
    ? {
        tagName: "text",
        attributes: {
          id: `${element.attributes.id || controlType}-content`,
          style: placeholder && textValue === placeholder ? "color:#9CA3AF" : "",
        },
        children: [],
        textContent: textValue,
      }
    : null;

  const {
    placeholder: _placeholder,
    value: _value,
    rows: _rows,
    type: _type,
    disabled: _disabled,
    selected: _selected,
    ...restAttributes
  } = element.attributes;

  return {
    tagName: "div",
    attributes: {
      ...restAttributes,
      style: controlStyle,
      "data-control-type": controlType,
      ...(placeholder ? { "data-placeholder": placeholder } : {}),
      ...(element.attributes.value ? { "data-value": element.attributes.value } : {}),
      ...(controlType === "textarea" ? { "data-rows": String(rows) } : {}),
      ...(element.attributes.type ? { "data-input-type": element.attributes.type } : {}),
      ...(controlType === "select" && selectedOption?.attributes.value
        ? { "data-selected-value": selectedOption.attributes.value }
        : {}),
      ...(element.attributes.disabled !== undefined ? { "data-disabled": "true" } : {}),
    },
    children: textChild ? [textChild] : [],
    textContent: "",
  };
};

const expandGridElement = (element: MarkupElement): MarkupElement => {
  const style = computeStyle(element.attributes);
  const tracks = style.gridTemplateColumns;
  if (style.display !== "grid" || !tracks || tracks.length <= 1) {
    return element;
  }

  const rowGap = style.rowGap ?? style.gap ?? 0;
  const columnGap = style.columnGap ?? style.gap ?? 0;
  const root = cloneMarkupElement(element);
  delete root.attributes["grid-template-columns"];
  delete root.attributes["row-gap"];
  delete root.attributes["column-gap"];
  root.attributes.display = "flex";
  root.attributes["flex-direction"] = "column";
  root.attributes.gap = String(rowGap);

  const rows = chunkArray(
    root.children.map((child) => ({
      ...cloneMarkupElement(child),
      attributes: {
        ...child.attributes,
        style: appendStyleDeclaration(
          child.attributes.style,
          (() => {
            const index = root.children.indexOf(child);
            const track = tracks[index % tracks.length] as GridTrack | undefined;
            if (!track) {
              return "flex:1";
            }
            if (track.kind === "fr") {
              return `flex-grow:${track.value};flex-shrink:1;flex-basis:0`;
            }
            const width =
              track.value.kind === "percent" ? `${track.value.value}%` : `${track.value.value}px`;
            return `width:${width};min-width:${width};max-width:${width};flex-grow:0;flex-shrink:0;flex-basis:${width}`;
          })(),
        ),
      },
    })),
    tracks.length,
  );

  root.children = rows.map((children, index) => ({
    tagName: "div",
    attributes: {
      id: `${root.attributes.id || "grid"}-row-${index + 1}`,
      display: "flex",
      "flex-direction": "row",
      gap: String(columnGap),
    },
    children,
    textContent: "",
  }));

  return root;
};

const normalizeMarkupTree = (element: MarkupElement): MarkupElement => {
  const next = cloneMarkupElement(element);
  next.children = next.children.map(normalizeMarkupTree);

  if (next.tagName === "input" || next.tagName === "textarea" || next.tagName === "select") {
    return buildControlElement(next);
  }

  return expandGridElement(next);
};

export const parseMarkup = (
  markup: string,
  expectedRoot: MarkupTag,
): { root: MarkupElement | null; errors: string[] } => {
  const normalizedMarkup = markup
    .trim()
    .replace(/^<!\[CDATA\[/i, "")
    .replace(/\]\]>$/i, "")
    .trim();

  if (!normalizedMarkup) {
    return { root: null, errors: ["markupText 不能为空"] };
  }

  if (normalizedMarkup.includes("&lt;") || normalizedMarkup.includes("&gt;")) {
    return {
      root: null,
      errors: ["markupText 不能是转义后的 HTML，请直接传 <page> 或 <section> 标记"],
    };
  }

  try {
    const document = parseDocument(normalizedMarkup, {
      lowerCaseAttributeNames: true,
      lowerCaseTags: true,
      recognizeSelfClosing: true,
    });
    const roots = (document.children || []).filter(isElementNode);
    if (roots.length !== 1) {
      return { root: null, errors: ["markupText 只能包含一个根节点"] };
    }

    const root = normalizeMarkupTree(toMarkupElement(roots[0]));
    if (root.tagName !== expectedRoot) {
      return { root: null, errors: [`markupText 根节点必须是 <${expectedRoot}>`] };
    }

    const validationErrors = validateAttributes(root);
    if (validationErrors.length > 0) {
      return { root: null, errors: validationErrors };
    }

    return { root, errors: [] };
  } catch (error) {
    return {
      root: null,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
};

export const cloneElementTree = cloneMarkupElement;

import type { DesignDocSection, DesignNode, ExecutableDesignDoc } from "../designDocSchema";

const escapeText = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const formatTextWithBreaks = (value: string) => escapeText(value).split("\n").join("<br />");

const styleToAttribute = (node: DesignNode) => {
  const declarations: string[] = [];
  declarations.push(`width:${Math.round(node.width)}px`);
  declarations.push(`height:${Math.round(node.height)}px`);

  const imageFill =
    node.style?.fill?.type === "image"
      ? node.style.fill
      : Array.isArray(node.style?.fills)
        ? node.style.fills.find((fill) => fill.type === "image" && fill.assetUrl)
        : undefined;
  const solidFill =
    node.style?.fill?.type === "solid"
      ? node.style.fill
      : Array.isArray(node.style?.fills)
        ? node.style.fills.find((fill) => fill.type === "solid" && fill.color)
        : undefined;

  if (solidFill?.color) {
    declarations.push(`background:${solidFill.color}`);
  }
  if (imageFill?.assetUrl) {
    declarations.push(`background-image:url(${imageFill.assetUrl})`);
  }
  if (node.style?.stroke?.color && node.style.stroke.width !== undefined) {
    declarations.push(`border:${node.style.stroke.width}px solid ${node.style.stroke.color}`);
  }
  if (node.style?.radius !== undefined) {
    declarations.push(`border-radius:${node.style.radius}px`);
  }
  if (node.style?.textColor) {
    declarations.push(`color:${node.style.textColor}`);
  }
  if (node.style?.fontSize !== undefined) {
    declarations.push(`font-size:${node.style.fontSize}px`);
  }
  if (node.style?.fontWeight !== undefined) {
    declarations.push(`font-weight:${node.style.fontWeight}`);
  }
  if (node.style?.letterSpacing !== undefined) {
    declarations.push(`letter-spacing:${node.style.letterSpacing}px`);
  }
  if (node.style?.align) {
    declarations.push(`text-align:${node.style.align}`);
  }
  if (node.style?.shadow) {
    const opacity =
      typeof node.style.shadow.opacity === "number" ? node.style.shadow.opacity : undefined;
    const color =
      opacity !== undefined
        ? `rgba(${parseInt(node.style.shadow.color.slice(1, 3), 16)}, ${parseInt(node.style.shadow.color.slice(3, 5), 16)}, ${parseInt(node.style.shadow.color.slice(5, 7), 16)}, ${opacity})`
        : node.style.shadow.color;
    declarations.push(
      `box-shadow:${node.style.shadow.x}px ${node.style.shadow.y}px ${node.style.shadow.blur}px ${color}`,
    );
  }
  if (typeof node.props?.backgroundSize === "string") {
    declarations.push(`background-size:${node.props.backgroundSize}`);
  }
  if (typeof node.props?.minWidth === "string") {
    declarations.push(`min-width:${node.props.minWidth}`);
  }
  if (typeof node.props?.aspectRatio === "string") {
    declarations.push(`aspect-ratio:${node.props.aspectRatio}`);
  }
  if (typeof node.props?.flexGrow === "string") {
    declarations.push(`flex-grow:${node.props.flexGrow}`);
  }
  if (typeof node.props?.flexShrink === "string") {
    declarations.push(`flex-shrink:${node.props.flexShrink}`);
  }
  if (typeof node.props?.flexBasis === "string") {
    declarations.push(`flex-basis:${node.props.flexBasis}`);
  }
  if (typeof node.props?.maxHeight === "string") {
    declarations.push(`max-height:${node.props.maxHeight}`);
  }
  if (typeof node.props?.backgroundPosition === "string") {
    declarations.push(`background-position:${node.props.backgroundPosition}`);
  }
  if (typeof node.props?.whiteSpace === "string") {
    declarations.push(`white-space:${node.props.whiteSpace}`);
  }
  if (typeof node.props?.outline === "string") {
    declarations.push(`outline:${node.props.outline}`);
  }
  if (typeof node.props?.verticalAlign === "string") {
    declarations.push(`vertical-align:${node.props.verticalAlign}`);
  }
  if (typeof node.props?.transform === "string") {
    declarations.push(`transform:${node.props.transform}`);
  }
  if (typeof node.props?.filter === "string") {
    declarations.push(`filter:${node.props.filter}`);
  }
  if (typeof node.props?.boxSizing === "string") {
    declarations.push(`box-sizing:${node.props.boxSizing}`);
  }
  if (typeof node.props?.overflow === "string") {
    declarations.push(`overflow:${node.props.overflow}`);
  }
  if (typeof node.props?.overflowY === "string") {
    declarations.push(`overflow-y:${node.props.overflowY}`);
  }
  if (typeof node.props?.animation === "string") {
    declarations.push(`animation:${node.props.animation}`);
  }
  if (typeof node.props?.backgroundClip === "string") {
    declarations.push(`background-clip:${node.props.backgroundClip}`);
    declarations.push(`-webkit-background-clip:${node.props.backgroundClip}`);
  }
  if (typeof node.props?.backdropFilter === "string") {
    declarations.push(`backdrop-filter:${node.props.backdropFilter}`);
  }
  if (typeof node.props?.webkitTextFillColor === "string") {
    declarations.push(`-webkit-text-fill-color:${node.props.webkitTextFillColor}`);
  }
  if (typeof node.props?.textOverflow === "string") {
    declarations.push(`text-overflow:${node.props.textOverflow}`);
  }
  if (typeof node.props?.listStyle === "string") {
    declarations.push(`list-style:${node.props.listStyle}`);
  }
  for (const [key, value] of Object.entries(node.props || {})) {
    if (!key.startsWith("-webkit-") || typeof value !== "string" || !value.trim()) {
      continue;
    }
    if (key === "-webkit-background-clip" || key === "-webkit-text-fill-color") {
      continue;
    }
    declarations.push(`${key}:${value}`);
  }
  for (const [key, value] of Object.entries(node.props || {})) {
    if (!key.startsWith("css:") || typeof value !== "string" || !value.trim()) {
      continue;
    }
    declarations.push(`${key.slice(4)}:${value}`);
  }

  return declarations.join(";");
};

const sectionStyleToAttribute = (section: DesignDocSection, pageWidth: number) => {
  const declarations: string[] = [];
  if (typeof section.width === "number") {
    declarations.push(`width:${Math.round(section.width)}px`);
    if (typeof section.x === "number") {
      const centeredX = Math.max(0, Math.round((pageWidth - section.width) / 2));
      if (Math.abs(centeredX - section.x) <= 1) {
        declarations.push("margin:0 auto");
      } else if (section.x > 0) {
        declarations.push(`margin-left:${Math.round(section.x)}px`);
      }
    }
  }
  declarations.push(`min-height:${Math.round(section.height)}px`);
  if (section.background) {
    declarations.push(`background:${section.background}`);
  }
  return declarations.join(";");
};

const renderAttributes = (attributes: Record<string, string | undefined>) =>
  Object.entries(attributes)
    .filter(([, value]) => typeof value === "string" && value.length > 0)
    .map(([key, value]) => `${key}="${escapeAttribute(value || "")}"`)
    .join(" ");

const getStateAttributes = (node: DesignNode) =>
  Object.fromEntries(
    Object.entries(node.props || {}).filter(
      ([key, value]) =>
        (key.startsWith("hover-") || key.startsWith("focus-") || key.startsWith("active-")) &&
        typeof value === "string",
    ),
  ) as Record<string, string>;

const serializeNode = (node: DesignNode, indent: string): string => {
  const style = styleToAttribute(node);
  const common = {
    id: node.id,
    ...(node.name && node.name !== node.id ? { name: node.name } : {}),
    ...(style ? { style } : {}),
  };

  if (
    node.props?.controlType === "input" ||
    node.props?.controlType === "textarea" ||
    node.props?.controlType === "select"
  ) {
    const tagName = node.props.controlType;
    const attributes = {
      ...common,
      ...(typeof node.props.placeholder === "string"
        ? { placeholder: node.props.placeholder }
        : {}),
      ...(typeof node.props.value === "string" ? { value: node.props.value } : {}),
      ...(typeof node.props.inputType === "string" ? { type: node.props.inputType } : {}),
      ...(typeof node.props.rows === "number" ? { rows: String(node.props.rows) } : {}),
      ...(typeof node.props.selectedValue === "string" ? { value: node.props.selectedValue } : {}),
      ...(node.props.disabled === true ? { disabled: "true" } : {}),
      ...getStateAttributes(node),
    };
    if (tagName === "select") {
      const optionLabel =
        typeof node.children?.[0]?.text === "string" && node.children[0].text.trim()
          ? node.children[0].text
          : typeof node.text === "string" && node.text.trim()
            ? node.text
            : typeof node.name === "string"
              ? node.name
              : "";
      const selectedValue =
        typeof node.props.selectedValue === "string" && node.props.selectedValue.trim()
          ? node.props.selectedValue
          : optionLabel;
      return `${indent}<select ${renderAttributes(attributes)}><option value="${escapeAttribute(
        selectedValue,
      )}" selected="true">${escapeText(optionLabel)}</option></select>`;
    }
    return tagName === "textarea"
      ? `${indent}<textarea ${renderAttributes(attributes)}></textarea>`
      : `${indent}<input ${renderAttributes(attributes)} />`;
  }

  if (node.type === "text" || node.type === "button") {
    const tagName =
      node.type === "button" ? "button" : node.props?.preformatted === true ? "pre" : "text";
    const content =
      tagName === "pre" ? escapeText(node.text || "") : formatTextWithBreaks(node.text || "");
    return `${indent}<${tagName} ${renderAttributes({ ...common, ...getStateAttributes(node) })}>${content}</${tagName}>`;
  }

  if (node.type === "image") {
    return `${indent}<img ${renderAttributes({
      ...common,
      ...(node.assetUrl ? { src: node.assetUrl } : {}),
      ...(typeof node.props?.alt === "string" ? { alt: node.props.alt } : {}),
      ...getStateAttributes(node),
    })} />`;
  }

  if (node.type === "shape") {
    return `${indent}<shape ${renderAttributes({
      ...common,
      ...(node.shapeKind ? { type: node.shapeKind } : {}),
      ...getStateAttributes(node),
    })} />`;
  }

  const children = Array.isArray(node.children)
    ? node.children.map((child) => serializeNode(child, `${indent}  `)).join("\n")
    : "";
  const open = `<div ${renderAttributes({ ...common, ...getStateAttributes(node) })}>`;
  const close = `</div>`;
  return children ? `${indent}${open}\n${children}\n${indent}${close}` : `${indent}${open}${close}`;
};

const serializeSection = (section: DesignDocSection, pageWidth: number, indent = "  ") => {
  const style = sectionStyleToAttribute(section, pageWidth);
  const attributes = renderAttributes({
    id: section.id,
    name: section.name,
    kind: section.kind,
    ...(style ? { style } : {}),
  });
  const children = section.nodes.map((node) => serializeNode(node, `${indent}  `)).join("\n");
  return children
    ? `${indent}<section ${attributes}>\n${children}\n${indent}</section>`
    : `${indent}<section ${attributes}></section>`;
};

export const serializeDesignDocToMarkup = (document: ExecutableDesignDoc) => {
  const pageAttributes = renderAttributes({
    name: document.page.name,
    ...(document.page.path ? { path: document.page.path } : {}),
    ...(document.page.theme ? { theme: document.page.theme } : {}),
    width: String(document.page.width),
    "min-height": String(document.page.minHeight),
    style: `background:${document.page.background}`,
  });

  const sections = document.sections
    .map((section) => serializeSection(section, document.page.width))
    .join("\n");
  return sections
    ? `<page ${pageAttributes}>\n${sections}\n</page>`
    : `<page ${pageAttributes}></page>`;
};

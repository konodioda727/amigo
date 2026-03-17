import { cloneElementTree, parseMarkup } from "./parser";
import type { ComponentAssetDefinition, ImageAssetDefinition, MarkupElement } from "./types";
import { normalizeWhitespace, toKebabCase } from "./utils";

const escapeText = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const renderAttributes = (attributes: Record<string, string>) =>
  Object.entries(attributes)
    .filter(([, value]) => typeof value === "string" && value.length > 0)
    .map(([key, value]) => `${key}="${escapeAttribute(value)}"`)
    .join(" ");

const serializeMarkupElement = (element: MarkupElement): string => {
  const attrs = renderAttributes(element.attributes);
  const open = attrs ? `<${element.tagName} ${attrs}>` : `<${element.tagName}>`;
  if (
    element.tagName === "img" ||
    element.tagName === "use" ||
    element.tagName === "input" ||
    element.tagName === "br"
  ) {
    return open.replace(/>$/, " />");
  }

  const children = element.children.map(serializeMarkupElement).join("");
  const text =
    element.tagName === "text" || element.tagName === "button" || element.tagName === "pre"
      ? escapeText(element.textContent || "")
      : "";

  return `${open}${children || text}</${element.tagName}>`;
};

const namespaceComponentIds = (
  element: MarkupElement,
  instanceId: string,
  isRoot = true,
): MarkupElement => {
  const next = cloneElementTree(element);
  if (isRoot) {
    next.attributes.id = instanceId;
  } else if (typeof next.attributes.id === "string" && next.attributes.id.trim()) {
    next.attributes.id = `${instanceId}--${next.attributes.id.trim()}`;
  }
  next.children = next.children.map((child) => namespaceComponentIds(child, instanceId, false));
  return next;
};

const parseComponentDefinition = (asset: ComponentAssetDefinition) => {
  const parsed = parseMarkup(asset.markupText, "component");
  if (!parsed.root || parsed.errors.length > 0) {
    throw new Error(
      `设计资产 ${asset.id} 无法解析: ${parsed.errors[0] || "component markup 无效"}`,
    );
  }
  return parsed.root;
};

export const buildComponentRegistry = (components: ComponentAssetDefinition[] = []) => {
  const registry = new Map<string, MarkupElement>();
  for (const component of components) {
    registry.set(component.id, parseComponentDefinition(component));
  }
  return registry;
};

export const buildImageRegistry = (images: ImageAssetDefinition[] = []) => {
  const registry = new Map<string, ImageAssetDefinition>();
  for (const image of images) {
    registry.set(image.id, image);
  }
  return registry;
};

export const extractInlineComponentDefinitions = (root: MarkupElement) => {
  const nextRoot = cloneElementTree(root);
  const inlineDefinitions: ComponentAssetDefinition[] = [];

  nextRoot.children = nextRoot.children.filter((child) => {
    if (child.tagName !== "components") {
      return true;
    }

    for (const component of child.children) {
      if (component.tagName !== "component") {
        throw new Error("<components> 下只能包含 <component>");
      }
      const id = normalizeWhitespace(component.attributes.id || "");
      if (!id) {
        throw new Error("<component> 缺少 id 属性");
      }
      inlineDefinitions.push({
        id,
        markupText: serializeMarkupElement(component),
      });
    }

    return false;
  });

  return {
    root: nextRoot,
    components: inlineDefinitions,
  };
};

export const extractInlineComponentDefinitionsFromMarkup = (markupText: string) => {
  const parsed = parseMarkup(markupText, "page");
  if (!parsed.root || parsed.errors.length > 0) {
    return {
      root: null,
      components: [] as ComponentAssetDefinition[],
      errors: parsed.errors,
    };
  }

  const extracted = extractInlineComponentDefinitions(parsed.root);
  return {
    root: extracted.root,
    components: extracted.components,
    errors: [] as string[],
  };
};

export const resolveComponentUses = (
  element: MarkupElement,
  componentRegistry: Map<string, MarkupElement>,
  trail: string[] = [],
): MarkupElement => {
  if (element.tagName === "use") {
    const componentId = (element.attributes.component || "").trim();
    if (!componentId) {
      throw new Error("<use> 缺少 component 属性");
    }

    if (trail.includes(componentId)) {
      throw new Error(`设计资产循环引用: ${[...trail, componentId].join(" -> ")}`);
    }

    const componentTemplate = componentRegistry.get(componentId);
    if (!componentTemplate) {
      throw new Error(`未找到设计资产 ${componentId}`);
    }

    const instanceId =
      normalizeWhitespace(element.attributes.id || "") ||
      toKebabCase(componentId) ||
      "component-instance";
    const instance = namespaceComponentIds(componentTemplate, instanceId);
    instance.attributes.name = normalizeWhitespace(
      element.attributes.name || instance.attributes.name || componentId,
    );
    instance.attributes["data-component-ref"] = componentId;
    instance.attributes["data-component-instance"] = instanceId;

    if (element.attributes.style?.trim()) {
      const baseStyle = instance.attributes.style?.trim();
      const overrideStyle = element.attributes.style.trim().replace(/;$/, "");
      instance.attributes.style = [baseStyle, overrideStyle].filter(Boolean).join(";");
    }

    for (const [key, value] of Object.entries(element.attributes)) {
      if (["component", "style", "name", "id"].includes(key)) {
        continue;
      }
      instance.attributes[key] = value;
    }

    return resolveComponentUses(instance, componentRegistry, [...trail, componentId]);
  }

  const next = cloneElementTree(element);
  next.children = next.children.map((child) =>
    resolveComponentUses(child, componentRegistry, trail),
  );
  return next;
};

export const resolveImageAssets = (
  element: MarkupElement,
  imageRegistry: Map<string, ImageAssetDefinition>,
): MarkupElement => {
  const next = cloneElementTree(element);
  if (next.tagName === "img") {
    const assetRef = normalizeWhitespace(next.attributes.asset || "");
    if (assetRef) {
      const asset = imageRegistry.get(assetRef);
      if (!asset) {
        throw new Error(`未找到图片资产 ${assetRef}`);
      }
      next.attributes.src = asset.url;
      next.attributes["data-asset-ref"] = assetRef;
      if (!next.attributes.width && typeof asset.width === "number" && asset.width > 0) {
        next.attributes.width = String(asset.width);
      }
      if (!next.attributes.height && typeof asset.height === "number" && asset.height > 0) {
        next.attributes.height = String(asset.height);
      }
    }
  }
  next.children = next.children.map((child) => resolveImageAssets(child, imageRegistry));
  return next;
};

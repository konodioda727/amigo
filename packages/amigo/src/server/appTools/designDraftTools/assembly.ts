import { parseDocument } from "htmlparser2";
import { normalizeId } from "./shared";

interface LayoutModuleSlot {
  moduleId: string;
  tagName: string;
  startIndex: number;
  endIndex: number;
  outerHtml: string;
}

interface HtmlNode {
  type?: string;
  name?: string;
  attribs?: Record<string, string>;
  children?: HtmlNode[];
  startIndex?: number | null;
  endIndex?: number | null;
}

const walkNodes = (nodes: HtmlNode[] | undefined, visitor: (node: HtmlNode) => void) => {
  if (!nodes) {
    return;
  }

  for (const node of nodes) {
    visitor(node);
    if (Array.isArray(node.children) && node.children.length > 0) {
      walkNodes(node.children, visitor);
    }
  }
};

export const collectLayoutModuleSlots = (layoutSource: string): LayoutModuleSlot[] => {
  const document = parseDocument(layoutSource, {
    withStartIndices: true,
    withEndIndices: true,
  });
  const slots: LayoutModuleSlot[] = [];

  walkNodes(document.children as HtmlNode[], (node) => {
    if (node.type !== "tag" || !node.attribs) {
      return;
    }

    const moduleId = normalizeId(node.attribs["data-module-id"] || "");
    if (!moduleId) {
      return;
    }

    const startIndex = typeof node.startIndex === "number" ? node.startIndex : -1;
    const endIndex = typeof node.endIndex === "number" ? node.endIndex : -1;
    if (startIndex < 0 || endIndex < startIndex) {
      return;
    }

    slots.push({
      moduleId,
      tagName: node.name || "div",
      startIndex,
      endIndex,
      outerHtml: layoutSource.slice(startIndex, endIndex + 1),
    });
  });

  return slots.sort((left, right) => left.startIndex - right.startIndex);
};

export const extractLayoutSlotHtml = (layoutSource: string, moduleId: string): string | null => {
  const normalizedModuleId = normalizeId(moduleId);
  const slot = collectLayoutModuleSlots(layoutSource).find(
    (item) => item.moduleId === normalizedModuleId,
  );
  return slot?.outerHtml || null;
};

export const validateModuleDraftHtml = (moduleId: string, html: string): string[] => {
  const normalizedModuleId = normalizeId(moduleId);
  const trimmed = html.trim();
  const errors: string[] = [];

  if (!trimmed) {
    errors.push("html 不能为空");
  }
  if (!/<[a-z][\s\S]*>/i.test(trimmed)) {
    errors.push("模块 HTML 必须包含有效的根节点");
  }
  if (/<script[\s>]/i.test(trimmed)) {
    errors.push("模块 HTML 不允许包含 <script>");
  }
  if (!new RegExp(`\\bdata-module-id\\s*=\\s*["']${normalizedModuleId}["']`, "i").test(trimmed)) {
    errors.push(`模块 HTML 根节点必须保留 data-module-id="${normalizedModuleId}"`);
  }

  return errors;
};

const assembleDraftFromLayoutInternal = (
  layoutSource: string,
  moduleHtmlById: Record<string, string>,
  allowMissingModules: boolean,
): { content: string; moduleOrder: string[] } => {
  const slots = collectLayoutModuleSlots(layoutSource);
  const missingModules = slots
    .map((slot) => slot.moduleId)
    .filter((moduleId) => !moduleHtmlById[moduleId]?.trim());
  if (!allowMissingModules && missingModules.length > 0) {
    throw new Error(`缺少这些模块草稿: ${missingModules.join(", ")}`);
  }

  let content = layoutSource;
  const replacements = [...slots].sort((left, right) => right.startIndex - left.startIndex);

  for (const slot of replacements) {
    const replacement = moduleHtmlById[slot.moduleId];
    if (!replacement?.trim()) {
      continue;
    }
    const validationErrors = validateModuleDraftHtml(slot.moduleId, replacement);
    if (validationErrors.length > 0) {
      throw new Error(`${slot.moduleId}: ${validationErrors[0]}`);
    }

    content =
      content.slice(0, slot.startIndex) + replacement.trim() + content.slice(slot.endIndex + 1);
  }

  return {
    content,
    moduleOrder: slots.map((slot) => slot.moduleId),
  };
};

export const assembleDraftFromLayout = (
  layoutSource: string,
  moduleHtmlById: Record<string, string>,
): { content: string; moduleOrder: string[] } =>
  assembleDraftFromLayoutInternal(layoutSource, moduleHtmlById, false);

export const assembleDraftFromLayoutProgressive = (
  layoutSource: string,
  moduleHtmlById: Record<string, string>,
): { content: string; moduleOrder: string[] } =>
  assembleDraftFromLayoutInternal(layoutSource, moduleHtmlById, true);

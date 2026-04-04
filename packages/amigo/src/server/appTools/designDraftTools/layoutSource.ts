import { normalizeId } from "./shared";

const FORBIDDEN_DOCUMENT_TAG_PATTERN =
  /<!DOCTYPE|<(html|head|body|script|style|title|meta|link)\b/i;
const FORBIDDEN_GRADIENT_CLASS_PATTERN = /\b(bg-gradient(?:-[a-z]+)?|from-|via-|to-)\S*/i;
const FORBIDDEN_COLOR_CLASS_PATTERN =
  /\b(?:bg|text|border|ring|stroke|fill|decoration|shadow)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)\b/i;

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const parseNumericLike = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^-?(\d+(?:\.\d+)?)(?:px)?$/);
  return match ? Number(match[1]) : undefined;
};

const extractInlineStyle = (source: string) => {
  const quotedStyle = source.match(/\bstyle\s*=\s*["']([^"']+)["']/)?.[1] || "";
  if (quotedStyle) {
    return quotedStyle;
  }

  const objectStyle = source.match(/\bstyle\s*=\s*\{\{([\s\S]*?)\}\}/)?.[1] || "";
  return objectStyle;
};

const _extractStyleKeys = (source: string) =>
  extractInlineStyle(source)
    .split(/[;,]/)
    .map((part) => {
      const separatorIndex = part.indexOf(":");
      return separatorIndex >= 0 ? part.slice(0, separatorIndex).trim() : "";
    })
    .filter(Boolean);

const extractVisibleTextContent = (source: string) =>
  source
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractDataModuleIds = (source: string, fallback?: unknown) => {
  const ids = new Set<string>();
  const pattern = /\bdata-module-id\s*=\s*["']([^"']+)["']/g;

  for (const match of source.matchAll(pattern)) {
    const normalized = normalizeId(match[1] || "");
    if (normalized) {
      ids.add(normalized);
    }
  }

  for (const value of readStringArray(fallback)) {
    const normalized = normalizeId(value);
    if (normalized) {
      ids.add(normalized);
    }
  }

  return [...ids];
};

const countBlockElements = (source: string) =>
  (source.match(/<(div|section|header|footer|main|aside|article|nav|figure|ul|ol|li)\b/gi) || [])
    .length;

const readStyleNumericValue = (source: string, key: string) => {
  const style = extractInlineStyle(source);
  if (!style) {
    return undefined;
  }

  const match = style.match(
    new RegExp(`${key}\\s*:\\s*(?:(["'])?(-?\\d+(?:\\.\\d+)?)(?:px)?\\1|(-?\\d+(?:\\.\\d+)?))`),
  );
  const value = match?.[2] || match?.[3];
  return value ? Number(value) : undefined;
};

export const validateLayoutSkeletonSource = (source: string) => {
  const errors: string[] = [];
  const trimmed = source.trim();

  if (!trimmed) {
    errors.push("source 不能为空");
  }
  if (!/<(div|section|header|footer|main|aside|article|nav)\b/i.test(trimmed)) {
    errors.push("source 必须是 HTML 布局骨架，至少包含一个容器标签");
  }
  if (/<Layout\b|<Node\b/i.test(trimmed)) {
    errors.push("布局阶段不要再输出 Yoga <Layout>/<Node>，请直接输出 HTML 骨架");
  }
  if (FORBIDDEN_DOCUMENT_TAG_PATTERN.test(trimmed)) {
    errors.push("布局骨架只能提交 HTML 片段，禁止输出 html/head/body/script/style 等完整文档标签");
  }
  if (/<script\b/i.test(trimmed)) {
    errors.push("布局骨架中不允许包含 script");
  }
  if (!/\bclass(Name)?\s*=/i.test(trimmed)) {
    errors.push("布局骨架请使用 Tailwind class 表达结构，不要只写裸 HTML");
  }
  if (FORBIDDEN_GRADIENT_CLASS_PATTERN.test(trimmed)) {
    errors.push("布局骨架中不允许使用渐变相关 class，只能使用黑白灰占位块");
  }
  if (FORBIDDEN_COLOR_CLASS_PATTERN.test(trimmed)) {
    errors.push("布局骨架中不允许使用彩色 class，只能使用黑白灰和中性色");
  }

  const visibleText = extractVisibleTextContent(trimmed);
  if (visibleText) {
    errors.push("布局骨架中不允许包含可见文字，标题/正文/按钮/价格/品牌名等都必须改成占位块");
  }

  const moduleIds = extractDataModuleIds(trimmed);
  if (moduleIds.length === 0) {
    errors.push(
      '布局骨架必须使用 data-module-id 标出业务区域，例如 <section data-module-id="hero">',
    );
  }

  return errors;
};

export const countLayoutSkeletonBlocks = (source: string) => countBlockElements(source);

export const hasExplicitLayoutSkeletonCanvasSize = (source: string) => {
  const rootTag = source.match(/<(div|main|section)\b[\s\S]*?>/i)?.[0] || "";
  return (
    readStyleNumericValue(rootTag, "width") !== undefined &&
    readStyleNumericValue(rootTag, "height") !== undefined
  );
};

export const extractLayoutSkeletonModuleIds = (source: string, fallback?: unknown) =>
  extractDataModuleIds(source, fallback);

export const inferLayoutSkeletonCanvasSize = (source: string) => {
  const rootTag = source.match(/<(div|main|section)\b[\s\S]*?>/i)?.[0] || "";

  return {
    width: readStyleNumericValue(rootTag, "width") || 1440,
    height: readStyleNumericValue(rootTag, "height") || 1600,
  };
};

export const coerceLayoutCanvasSize = parseNumericLike;

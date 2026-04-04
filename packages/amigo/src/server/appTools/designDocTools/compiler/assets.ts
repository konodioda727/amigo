import { cloneElementTree, parseMarkup } from "./parser";
import type { MarkupElement } from "./types";

const walkMarkup = (element: MarkupElement, visit: (node: MarkupElement) => void) => {
  visit(element);
  for (const child of element.children) {
    walkMarkup(child, visit);
  }
};

export const assertNoLegacyAssetSyntax = (markupText: string): string[] => {
  const directErrors: string[] = [];
  if (/<\s*use\b/i.test(markupText)) {
    directErrors.push('<use component="..."> 已不再支持');
  }
  if (/<\s*components\b/i.test(markupText) || /<\s*component\b/i.test(markupText)) {
    directErrors.push("<components> / <component> 已不再支持");
  }
  if (/\sasset\s*=/i.test(markupText)) {
    directErrors.push('<img asset="..."> 已不再支持，请改用 <img src="...">');
  }
  if (directErrors.length > 0) {
    return directErrors;
  }

  const parsed = parseMarkup(markupText, "page");
  if (!parsed.root || parsed.errors.length > 0) {
    return parsed.errors;
  }

  const errors: string[] = [];
  walkMarkup(cloneElementTree(parsed.root), (node) => {
    if ((node as { tagName: string }).tagName === "use") {
      errors.push('<use component="..."> 已不再支持');
      return;
    }

    if ((node as { tagName: string }).tagName === "components") {
      errors.push("<components> / <component> 已不再支持");
      return;
    }

    if (node.tagName === "img" && typeof node.attributes.asset === "string") {
      errors.push('<img asset="..."> 已不再支持，请改用 <img src="...">');
    }
  });

  return errors;
};

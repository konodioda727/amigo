import type { ExecutableDesignDoc } from "../designDocSchema";
import { assertNoLegacyAssetSyntax } from "./assets";
import { DEFAULT_PAGE_MIN_HEIGHT, DEFAULT_PAGE_WIDTH } from "./constants";
import { compileSection } from "./output";
import { parseMarkup } from "./parser";
import { computeStyle } from "./styles";
import type { CompileContext, MarkupElement } from "./types";
import { parseLength, parseNumber, resolveLength } from "./utils";

export { serializeDesignDocToMarkup } from "./serialize";

export const compileDesignDocFromMarkup = (
  markupText: string,
): { document: ExecutableDesignDoc | null; errors: string[] } => {
  if (!markupText.trim()) {
    return { document: null, errors: ["markupText 不能为空"] };
  }

  const syntaxErrors = assertNoLegacyAssetSyntax(markupText);
  if (syntaxErrors.length > 0) {
    return { document: null, errors: syntaxErrors };
  }

  const parsed = parseMarkup(markupText, "page");
  if (!parsed.root || parsed.errors.length > 0) {
    return { document: null, errors: parsed.errors };
  }

  const root = parsed.root;
  const pageStyle = computeStyle(root.attributes);
  const pageWidth = Math.round(
    resolveLength(parseLength(root.attributes.width), DEFAULT_PAGE_WIDTH, DEFAULT_PAGE_WIDTH),
  );
  const sections = root.children.filter((child) => child.tagName === "section");
  if (sections.length === 0) {
    return { document: null, errors: ["<page> 下至少需要一个 <section>"] };
  }

  const context: CompileContext = {
    ids: new Set<string>(),
  };

  let currentY = 0;
  const compiledSections = sections.map((section) => {
    const compiled = compileSection(section, pageWidth, currentY, context);
    currentY += compiled.height;
    return compiled;
  });

  const minHeight = Math.max(
    parseNumber(root.attributes["min-height"]) || parseNumber(root.attributes.minheight) || 0,
    currentY,
    DEFAULT_PAGE_MIN_HEIGHT,
  );

  return {
    document: {
      page: {
        name: root.attributes.name || root.attributes.title || "Untitled Page",
        ...(root.attributes.path ? { path: root.attributes.path } : {}),
        ...(root.attributes.theme ? { theme: root.attributes.theme } : {}),
        width: pageWidth,
        minHeight,
        background: pageStyle.backgroundColor || "#FFFFFF",
      },
      designTokens: {
        colors: {},
        spacing: {},
        radius: {},
        typography: {},
      },
      sections: compiledSections,
    },
    errors: [],
  };
};

export const compileDesignSectionFromMarkup = ({
  markupText,
  pageWidth,
  startY = 0,
  reservedIds,
}: {
  markupText: string;
  pageWidth: number;
  startY?: number;
  reservedIds?: Iterable<string>;
}): { section: import("../designDocSchema").DesignDocSection | null; errors: string[] } => {
  if (!markupText.trim()) {
    return { section: null, errors: ["markupText 不能为空"] };
  }

  const syntaxErrors = assertNoLegacyAssetSyntax(`<page>${markupText}</page>`);
  if (syntaxErrors.length > 0) {
    return { section: null, errors: syntaxErrors };
  }

  const parsed = parseMarkup(markupText, "section");
  if (!parsed.root || parsed.errors.length > 0) {
    return { section: null, errors: parsed.errors };
  }

  const context: CompileContext = {
    ids: new Set(reservedIds || []),
  };

  try {
    return {
      section: compileSection(parsed.root, pageWidth, startY, context),
      errors: [],
    };
  } catch (error) {
    return {
      section: null,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
};

export const compileDesignDocSectionsFromMarkup = ({
  markupText,
  pageWidth,
  reservedIds,
}: {
  markupText: string;
  pageWidth: number;
  reservedIds?: Iterable<string>;
}): {
  sections: import("../designDocSchema").DesignDocSection[] | null;
  root: MarkupElement | null;
  errors: string[];
} => {
  if (!markupText.trim()) {
    return { sections: null, root: null, errors: ["markupText 不能为空"] };
  }

  const syntaxErrors = assertNoLegacyAssetSyntax(markupText);
  if (syntaxErrors.length > 0) {
    return { sections: null, root: null, errors: syntaxErrors };
  }

  const parsed = parseMarkup(markupText, "page");
  if (!parsed.root || parsed.errors.length > 0) {
    return { sections: null, root: null, errors: parsed.errors };
  }

  try {
    const root = parsed.root;
    const sections = root.children.filter((child) => child.tagName === "section");
    if (sections.length === 0) {
      return { sections: null, root: null, errors: ["<page> 下至少需要一个 <section>"] };
    }

    const context: CompileContext = {
      ids: new Set(reservedIds || []),
    };

    let currentY = 0;
    const compiledSections = sections.map((section) => {
      const compiled = compileSection(section, pageWidth, currentY, context);
      currentY += compiled.height;
      return compiled;
    });

    return {
      sections: compiledSections,
      root,
      errors: [],
    };
  } catch (error) {
    return {
      sections: null,
      root: null,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
};

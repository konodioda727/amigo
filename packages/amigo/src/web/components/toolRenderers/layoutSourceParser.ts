export interface YogaPreviewNode {
  id: string;
  moduleId?: string;
  label?: string;
  textContent?: string;
  style: Record<string, string | number | boolean>;
  children: YogaPreviewNode[];
}

export interface ParsedYogaLayout {
  root: YogaPreviewNode | null;
  moduleIds: string[];
  canvasWidth: number;
  canvasHeight: number;
}

const trimQuotes = (value: string) =>
  value.length >= 2 &&
  ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ? value.slice(1, -1)
    : value;

const splitTopLevel = (value: string, separator: string) => {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote && value[index - 1] !== "\\") {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "{" || char === "[" || char === "(") {
      depth += 1;
      continue;
    }

    if (char === "}" || char === "]" || char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (char === separator && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  const tail = value.slice(start).trim();
  if (tail) {
    parts.push(tail);
  }

  return parts;
};

const extractBetweenBalanced = (source: string, startToken: string) => {
  const start = source.indexOf(startToken);
  if (start < 0) {
    return "";
  }

  const contentStart = start + startToken.length;
  let depth = 2;
  let quote: '"' | "'" | null = null;

  for (let index = contentStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote && source[index - 1] !== "\\") {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(contentStart, index).trim();
      }
    }
  }

  return "";
};

const parseStyleValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimQuotes(trimmed);
};

const parseNumericDimension = (value: unknown) => {
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

const parseStyleObject = (tagSource: string) => {
  const styleBlock = extractBetweenBalanced(tagSource, "style={{");
  const style: Record<string, string | number | boolean> = {};
  for (const part of splitTopLevel(styleBlock, ",")) {
    const separatorIndex = part.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!key || !value) {
      continue;
    }
    style[key] = parseStyleValue(value);
  }
  return style;
};

const readBraceAttribute = (tagSource: string, name: string) => {
  const match = tagSource.match(new RegExp(`\\b${name}\\s*=\\s*\\{([^}]+)\\}`));
  if (!match) {
    return undefined;
  }
  return parseStyleValue(match[1] || "");
};

const readNumericAttribute = (tagSource: string, name: string) => {
  const braceValue = readBraceAttribute(tagSource, name);
  if (braceValue !== undefined) {
    return parseNumericDimension(braceValue);
  }

  const quotedValue = readAttribute(tagSource, name);
  return quotedValue !== undefined ? parseNumericDimension(quotedValue) : undefined;
};

const readAttribute = (tagSource: string, name: string) => {
  const match = tagSource.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`));
  return match ? match[1].trim() : undefined;
};

const readTag = (source: string, start: number) => {
  let index = start;
  let quote: '"' | "'" | null = null;
  let braceDepth = 0;

  while (index < source.length) {
    const char = source[index];
    if (quote) {
      if (char === quote && source[index - 1] !== "\\") {
        quote = null;
      }
      index += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      index += 1;
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
      index += 1;
      continue;
    }

    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      index += 1;
      continue;
    }

    if (char === ">" && braceDepth === 0) {
      const tagSource = source.slice(start, index + 1);
      return {
        tagSource,
        end: index + 1,
        selfClosing: /\/>\s*$/.test(tagSource),
      };
    }

    index += 1;
  }

  return null;
};

export const parseYogaLayoutSource = (source: string): ParsedYogaLayout | null => {
  if (!source.trim()) {
    return null;
  }

  const stack: YogaPreviewNode[] = [];
  const moduleIds = new Set<string>();
  let root: YogaPreviewNode | null = null;
  let nodeIndex = 0;

  for (let index = 0; index < source.length; ) {
    if (source[index] !== "<") {
      const nextTagIndex = source.indexOf("<", index);
      const rawText = nextTagIndex >= 0 ? source.slice(index, nextTagIndex) : source.slice(index);
      const text = rawText.replace(/\s+/g, " ").trim();
      if (text && stack.length > 0) {
        const current = stack[stack.length - 1];
        current.textContent = current.textContent ? `${current.textContent} ${text}`.trim() : text;
      }
      index = nextTagIndex >= 0 ? nextTagIndex : source.length;
      continue;
    }

    if (source.startsWith("</Node>", index)) {
      stack.pop();
      index += "</Node>".length;
      continue;
    }

    if (source.startsWith("<Layout", index)) {
      const tag = readTag(source, index);
      if (!tag) {
        break;
      }
      const style = parseStyleObject(tag.tagSource);
      const width = readNumericAttribute(tag.tagSource, "width");
      const height = readNumericAttribute(tag.tagSource, "height");
      root = {
        id: "layout-root",
        style: {
          ...style,
          ...(width !== undefined ? { width } : {}),
          ...(height !== undefined ? { height } : {}),
          ...(style.width === undefined && width === undefined ? { width: 320 } : {}),
          ...(style.height === undefined && height === undefined ? { height: 560 } : {}),
        },
        children: [],
      };
      stack.push(root);
      index = tag.end;
      continue;
    }

    if (source.startsWith("</Layout>", index)) {
      if (stack.length > 0) {
        stack.pop();
      }
      index += "</Layout>".length;
      continue;
    }

    if (source.startsWith("<Node", index)) {
      const tag = readTag(source, index);
      if (!tag) {
        break;
      }

      const moduleId = readAttribute(tag.tagSource, "moduleId");
      const label = readAttribute(tag.tagSource, "label");
      const node: YogaPreviewNode = {
        id: `${moduleId || label || "node"}-${nodeIndex}`,
        moduleId,
        label,
        style: parseStyleObject(tag.tagSource),
        children: [],
      };

      if (moduleId) {
        moduleIds.add(moduleId);
      }

      if (stack.length === 0) {
        root = node;
      } else {
        stack[stack.length - 1]?.children.push(node);
      }

      if (!tag.selfClosing) {
        stack.push(node);
      }

      nodeIndex += 1;
      index = tag.end;
      continue;
    }

    index += 1;
  }

  const canvasWidth = typeof root?.style.width === "number" ? (root.style.width as number) : 320;
  const canvasHeight = typeof root?.style.height === "number" ? (root.style.height as number) : 560;

  return {
    root,
    moduleIds: [...moduleIds],
    canvasWidth,
    canvasHeight,
  };
};

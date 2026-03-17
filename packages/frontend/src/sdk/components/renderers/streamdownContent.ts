const DESIGN_DOC_TAG_PATTERN = /<\s*(page|section)\b/i;
const FENCED_CODE_BLOCK_PATTERN = /(```[\s\S]*?```)/g;
const DESIGN_DOC_BLOCK_PATTERN =
  /<\s*page\b[\s\S]*?(?:<\/\s*page\s*>|$)|<\s*section\b[\s\S]*?(?:<\/\s*section\s*>|$)/gi;

const wrapAsCodeBlock = (block: string) => `\n\`\`\`html\n${block.trim()}\n\`\`\`\n`;

const escapeDesignDocMarkup = (segment: string) =>
  segment.replace(DESIGN_DOC_BLOCK_PATTERN, (block) => wrapAsCodeBlock(block));

export const prepareStreamdownContent = (content: string) => {
  if (!content || !DESIGN_DOC_TAG_PATTERN.test(content)) {
    return content;
  }

  return content
    .split(FENCED_CODE_BLOCK_PATTERN)
    .map((segment) => (segment.startsWith("```") ? segment : escapeDesignDocMarkup(segment)))
    .join("");
};

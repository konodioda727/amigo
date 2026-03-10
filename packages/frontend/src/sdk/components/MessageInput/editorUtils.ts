type EditorNode = {
  type?: string;
  text?: string;
  attrs?: {
    id?: string;
  };
  content?: EditorNode[];
};

const findMentionNode = (node: EditorNode): string | null => {
  if (node.type === "mention" && node.attrs?.id) {
    return node.attrs.id;
  }

  if (!Array.isArray(node.content)) {
    return null;
  }

  for (const child of node.content) {
    const result = findMentionNode(child);
    if (result) {
      return result;
    }
  }

  return null;
};

const extractPlainText = (node: EditorNode): string => {
  if (node.type === "mention") {
    return "";
  }

  if (node.type === "text" && node.text) {
    return node.text;
  }

  if (!Array.isArray(node.content)) {
    return "";
  }

  return node.content.map(extractPlainText).join("");
};

export const extractSessionIdFromEditorJson = (document: EditorNode): string | null =>
  findMentionNode(document);

export const getTextWithoutMentionsFromEditorJson = (document: EditorNode): string =>
  extractPlainText(document).trim();

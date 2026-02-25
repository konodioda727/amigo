export const findMatchedTag = (tags: string[], buffer: string) => {
  let labelIndex = -1;
  let currentTool = "";

  for (const label of tags) {
    const toolName = label.slice(1, -1);
    const pattern = new RegExp(`<${toolName}(\\s|\\/|>)`);
    const match = buffer.match(pattern);
    if (match && typeof match.index === "number") {
      currentTool = toolName;
      labelIndex = match.index;
      break;
    }
  }

  return {
    currentTool,
    labelIndex,
  };
};

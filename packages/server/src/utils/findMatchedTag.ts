export const findMatchedTag = (tags: string[], buffer: string) => {
  let labelIndex = -1;
  let currentTool = "";
  for (const label of tags) {
    const startIndex = buffer.indexOf(label);
    const isStartTagFound = buffer.indexOf(label) !== -1;
    if (isStartTagFound) {
      currentTool = label.slice(1, -1);
      labelIndex = startIndex;
      break;
    }
  }

  return {
    currentTool,
    labelIndex,
  };
};

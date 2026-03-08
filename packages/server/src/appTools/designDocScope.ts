export const resolveDesignDocOwnerTaskId = (taskId?: string, parentId?: string): string => {
  const normalizedParentId = typeof parentId === "string" ? parentId.trim() : "";
  if (normalizedParentId) {
    return normalizedParentId;
  }

  return typeof taskId === "string" ? taskId.trim() : "";
};

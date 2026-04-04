import { conversationRepository } from "@amigo-llm/backend";

export const resolveDesignDocOwnerTaskId = (taskId?: string, parentId?: string): string => {
  const normalize = (value?: string) => (typeof value === "string" ? value.trim() : "");

  let currentTaskId = normalize(parentId) || normalize(taskId);
  let lastTaskId = "";

  while (currentTaskId && currentTaskId !== lastTaskId) {
    const conversation =
      conversationRepository.get(currentTaskId) || conversationRepository.load(currentTaskId);
    if (!conversation?.parentId) {
      return currentTaskId;
    }

    lastTaskId = currentTaskId;
    currentTaskId = normalize(conversation.parentId);
  }

  return normalize(parentId) || normalize(taskId);
};

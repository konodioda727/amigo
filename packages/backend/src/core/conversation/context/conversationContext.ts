import type { WorkflowPromptScope } from "../../workflow";

export const readContextUserId = (context: unknown): string | undefined => {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return undefined;
  }

  const userId = (context as { userId?: unknown }).userId;
  return typeof userId === "string" && userId.trim() ? userId.trim() : undefined;
};

export const readSystemPromptAppendix = (
  context: unknown,
  promptScope: WorkflowPromptScope,
): string | undefined => {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return undefined;
  }

  const appendixContainer = (context as { systemPromptAppendix?: unknown }).systemPromptAppendix;
  if (
    !appendixContainer ||
    typeof appendixContainer !== "object" ||
    Array.isArray(appendixContainer)
  ) {
    return undefined;
  }

  const appendix = (appendixContainer as Record<string, unknown>)[promptScope];
  return typeof appendix === "string" && appendix.trim() ? appendix.trim() : undefined;
};

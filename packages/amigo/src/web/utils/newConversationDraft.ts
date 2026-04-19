const STORAGE_KEY = "amigo.newConversationDraft";

export interface NewConversationDraft {
  selectedModelKey: string;
  selectedSkillIds: string[];
}

const DEFAULT_DRAFT: NewConversationDraft = {
  selectedModelKey: "",
  selectedSkillIds: [],
};

const normalizeSkillIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
};

export function getNewConversationDraft(): NewConversationDraft {
  if (typeof window === "undefined") {
    return { ...DEFAULT_DRAFT };
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_DRAFT };
    }

    const parsed = JSON.parse(raw) as Partial<NewConversationDraft>;
    return {
      selectedModelKey:
        typeof parsed.selectedModelKey === "string" ? parsed.selectedModelKey.trim() : "",
      selectedSkillIds: normalizeSkillIds(parsed.selectedSkillIds),
    };
  } catch {
    return { ...DEFAULT_DRAFT };
  }
}

export function setNewConversationDraft(draft: NewConversationDraft): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      selectedModelKey: draft.selectedModelKey,
      selectedSkillIds: normalizeSkillIds(draft.selectedSkillIds),
    }),
  );
}

export function clearNewConversationDraft(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(STORAGE_KEY);
}

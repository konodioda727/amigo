import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  DesignSession,
  DraftAssemblyRecord,
  DraftCritique,
  DraftRenderArtifact,
  FinalDesignDraft,
  LayoutDraftOption,
  LayoutOption,
  ModuleDraft,
  ThemeOption,
} from "./shared";
import {
  ensureDirectoryExists,
  getDesignSessionPath,
  getDraftAssemblyPath,
  getDraftLatestCritiquePath,
  getDraftLatestRenderArtifactPath,
  getFinalDraftRecordPath,
  getFinalDraftsDirectoryPath,
  getModuleDraftRecordPath,
  getModuleDraftsDirectoryPath,
  normalizeId,
  parseDesignSession,
  parseDraftAssemblyRecord,
  parseDraftCritique,
  parseDraftRenderArtifact,
  parseFinalDesignDraft,
  parseLayoutDraftOptions,
  parseLayoutOptions,
  parseModuleDraft,
  parseThemeOptions,
  readJsonFile,
} from "./shared";

interface StoredDesignSessionPayload {
  session: DesignSession | null;
  layoutOptions: LayoutOption[];
  layoutDraftOptions: LayoutDraftOption[];
  themeOptions: ThemeOption[];
}

const EMPTY_SESSION_PAYLOAD: StoredDesignSessionPayload = {
  session: null,
  layoutOptions: [],
  layoutDraftOptions: [],
  themeOptions: [],
};

const readStoredDesignSessionPayload = (taskId: string): StoredDesignSessionPayload => {
  const parsed = readJsonFile<Record<string, unknown>>(getDesignSessionPath(taskId));
  if (!parsed) {
    return EMPTY_SESSION_PAYLOAD;
  }

  return {
    session: parseDesignSession(parsed.session),
    layoutOptions: parseLayoutOptions(parsed.layoutOptions),
    layoutDraftOptions: parseLayoutDraftOptions(parsed.layoutDraftOptions),
    themeOptions: parseThemeOptions(parsed.themeOptions),
  };
};

const writeStoredDesignSessionPayload = (taskId: string, payload: StoredDesignSessionPayload) => {
  const filePath = getDesignSessionPath(taskId);
  ensureDirectoryExists(path.dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  return filePath;
};

export const readStoredDesignSession = (taskId: string) =>
  readStoredDesignSessionPayload(taskId).session;

export const readStoredLayoutOptions = (taskId: string) =>
  readStoredDesignSessionPayload(taskId).layoutOptions;

export const readStoredLayoutDraftOptions = (taskId: string) =>
  readStoredDesignSessionPayload(taskId).layoutDraftOptions;

export const readStoredThemeOptions = (taskId: string) =>
  readStoredDesignSessionPayload(taskId).themeOptions;

export const upsertStoredDesignSession = (
  taskId: string,
  input: Omit<DesignSession, "createdAt" | "updatedAt" | "selectedLayoutId" | "selectedThemeId"> & {
    selectedLayoutId?: string | null;
    selectedThemeId?: string | null;
  },
): DesignSession => {
  const existingPayload = readStoredDesignSessionPayload(taskId);
  const existing = existingPayload.session;
  const now = new Date().toISOString();
  const session: DesignSession = {
    pageGoal: input.pageGoal.trim(),
    targetAudience: input.targetAudience.trim(),
    brandMood: input.brandMood.trim(),
    styleKeywords: input.styleKeywords,
    references: input.references,
    constraints: input.constraints,
    antiGoals: input.antiGoals,
    modules: input.modules,
    selectedLayoutId: input.selectedLayoutId ?? existing?.selectedLayoutId ?? null,
    selectedThemeId: input.selectedThemeId ?? existing?.selectedThemeId ?? null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  writeStoredDesignSessionPayload(taskId, {
    ...existingPayload,
    session,
  });

  return session;
};

export const upsertStoredLayoutOptions = (taskId: string, options: LayoutOption[]) => {
  const existingPayload = readStoredDesignSessionPayload(taskId);
  const mergedLayoutOptions = [...existingPayload.layoutOptions];

  for (const option of options) {
    const existingIndex = mergedLayoutOptions.findIndex(
      (existing) => existing.layoutId === option.layoutId,
    );
    if (existingIndex >= 0) {
      mergedLayoutOptions[existingIndex] = option;
    } else {
      mergedLayoutOptions.push(option);
    }
  }

  const selectedLayoutId = existingPayload.session?.selectedLayoutId || null;
  const nextSelectedLayoutId = mergedLayoutOptions.some(
    (option) => option.layoutId === selectedLayoutId,
  )
    ? selectedLayoutId
    : null;

  writeStoredDesignSessionPayload(taskId, {
    ...existingPayload,
    session: existingPayload.session
      ? {
          ...existingPayload.session,
          selectedLayoutId: nextSelectedLayoutId,
          updatedAt: new Date().toISOString(),
        }
      : existingPayload.session,
    layoutOptions: mergedLayoutOptions,
  });

  return mergedLayoutOptions;
};

export const upsertStoredLayoutDraftOptions = (taskId: string, options: LayoutDraftOption[]) => {
  const existingPayload = readStoredDesignSessionPayload(taskId);
  const mergedDraftOptions = [...existingPayload.layoutDraftOptions];

  for (const option of options) {
    const existingIndex = mergedDraftOptions.findIndex(
      (existing) => existing.layoutId === option.layoutId,
    );
    if (existingIndex >= 0) {
      mergedDraftOptions[existingIndex] = option;
    } else {
      mergedDraftOptions.push(option);
    }
  }

  writeStoredDesignSessionPayload(taskId, {
    ...existingPayload,
    layoutDraftOptions: mergedDraftOptions,
  });

  return mergedDraftOptions;
};

export const removeStoredLayoutDraftOptions = (taskId: string, layoutIds: string[]) => {
  if (layoutIds.length === 0) {
    return readStoredLayoutDraftOptions(taskId);
  }

  const removingIds = new Set(layoutIds.map((layoutId) => normalizeId(layoutId)));
  const existingPayload = readStoredDesignSessionPayload(taskId);
  const nextDraftOptions = existingPayload.layoutDraftOptions.filter(
    (option) => !removingIds.has(option.layoutId),
  );

  writeStoredDesignSessionPayload(taskId, {
    ...existingPayload,
    layoutDraftOptions: nextDraftOptions,
  });

  return nextDraftOptions;
};

export const upsertStoredThemeOptions = (taskId: string, options: ThemeOption[]) => {
  const existingPayload = readStoredDesignSessionPayload(taskId);
  const selectedThemeId = existingPayload.session?.selectedThemeId || null;
  const nextSelectedThemeId = options.some((option) => option.themeId === selectedThemeId)
    ? selectedThemeId
    : null;

  writeStoredDesignSessionPayload(taskId, {
    ...existingPayload,
    session: existingPayload.session
      ? {
          ...existingPayload.session,
          selectedThemeId: nextSelectedThemeId,
          updatedAt: new Date().toISOString(),
        }
      : existingPayload.session,
    themeOptions: options,
  });

  return options;
};

export const setStoredSelectedLayoutId = (
  taskId: string,
  layoutId: string,
): DesignSession | null => {
  const existingPayload = readStoredDesignSessionPayload(taskId);
  if (!existingPayload.session) {
    return null;
  }

  const session: DesignSession = {
    ...existingPayload.session,
    selectedLayoutId: layoutId,
    updatedAt: new Date().toISOString(),
  };
  writeStoredDesignSessionPayload(taskId, {
    ...existingPayload,
    session,
  });
  return session;
};

export const setStoredSelectedThemeId = (taskId: string, themeId: string): DesignSession | null => {
  const existingPayload = readStoredDesignSessionPayload(taskId);
  if (!existingPayload.session) {
    return null;
  }

  const session: DesignSession = {
    ...existingPayload.session,
    selectedThemeId: themeId,
    updatedAt: new Date().toISOString(),
  };
  writeStoredDesignSessionPayload(taskId, {
    ...existingPayload,
    session,
  });
  return session;
};

export const readStoredFinalDesignDraft = (
  taskId: string,
  draftId: string,
): FinalDesignDraft | null =>
  parseFinalDesignDraft(readJsonFile(getFinalDraftRecordPath(taskId, draftId)));

export const listStoredFinalDesignDrafts = (taskId: string): FinalDesignDraft[] => {
  const draftsDir = getFinalDraftsDirectoryPath(taskId);
  try {
    return readdirSync(draftsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readStoredFinalDesignDraft(taskId, entry.name))
      .filter((entry): entry is FinalDesignDraft => Boolean(entry))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
};

export const writeStoredFinalDesignDraftRecord = (taskId: string, draft: FinalDesignDraft) => {
  const filePath = getFinalDraftRecordPath(taskId, draft.draftId);
  ensureDirectoryExists(path.dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(draft, null, 2)}\n`, "utf-8");
  return filePath;
};

export const readStoredModuleDraft = (
  taskId: string,
  draftId: string,
  moduleId: string,
): ModuleDraft | null =>
  parseModuleDraft(readJsonFile(getModuleDraftRecordPath(taskId, draftId, moduleId)));

export const listStoredModuleDrafts = (taskId: string, draftId: string): ModuleDraft[] => {
  const modulesDir = getModuleDraftsDirectoryPath(taskId, draftId);
  try {
    return readdirSync(modulesDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readStoredModuleDraft(taskId, draftId, entry.name.replace(/\.json$/i, "")))
      .filter((entry): entry is ModuleDraft => Boolean(entry))
      .sort((left, right) => left.moduleId.localeCompare(right.moduleId));
  } catch {
    return [];
  }
};

export const writeStoredModuleDraftRecord = (taskId: string, draft: ModuleDraft) => {
  const filePath = getModuleDraftRecordPath(taskId, draft.draftId, draft.moduleId);
  ensureDirectoryExists(path.dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(draft, null, 2)}\n`, "utf-8");
  return filePath;
};

export const upsertStoredModuleDrafts = (
  taskId: string,
  draftId: string,
  drafts: Array<
    Omit<ModuleDraft, "createdAt" | "updatedAt" | "draftId" | "moduleId"> & {
      moduleId: string;
      draftId?: string;
    }
  >,
): ModuleDraft[] => {
  const now = new Date().toISOString();
  return drafts.map((input) => {
    const moduleId = normalizeId(input.moduleId);
    const existing = readStoredModuleDraft(taskId, draftId, moduleId);
    const nextRecord: ModuleDraft = {
      draftId: normalizeId(draftId),
      moduleId,
      title: input.title.trim() || existing?.title || moduleId,
      html: input.html.trim(),
      notes: typeof input.notes === "string" ? input.notes.trim() || null : existing?.notes || null,
      assetsUsed: input.assetsUsed,
      copySummary: input.copySummary.trim(),
      status: input.status,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    writeStoredModuleDraftRecord(taskId, nextRecord);
    return nextRecord;
  });
};

export const readStoredDraftAssembly = (
  taskId: string,
  draftId: string,
): DraftAssemblyRecord | null =>
  parseDraftAssemblyRecord(readJsonFile(getDraftAssemblyPath(taskId, draftId)));

export const writeStoredDraftAssembly = (taskId: string, record: DraftAssemblyRecord) => {
  const filePath = getDraftAssemblyPath(taskId, record.draftId);
  ensureDirectoryExists(path.dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  return filePath;
};

export const readStoredLatestDraftRenderArtifact = (
  taskId: string,
  draftId: string,
): DraftRenderArtifact | null =>
  parseDraftRenderArtifact(readJsonFile(getDraftLatestRenderArtifactPath(taskId, draftId)));

export const writeStoredLatestDraftRenderArtifact = (
  taskId: string,
  artifact: DraftRenderArtifact,
) => {
  const filePath = getDraftLatestRenderArtifactPath(taskId, artifact.draftId);
  ensureDirectoryExists(path.dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf-8");
  return filePath;
};

export const readStoredLatestDraftCritique = (
  taskId: string,
  draftId: string,
): DraftCritique | null =>
  parseDraftCritique(readJsonFile(getDraftLatestCritiquePath(taskId, draftId)));

export const writeStoredLatestDraftCritique = (taskId: string, critique: DraftCritique) => {
  const filePath = getDraftLatestCritiquePath(taskId, critique.draftId);
  ensureDirectoryExists(path.dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(critique, null, 2)}\n`, "utf-8");
  return filePath;
};

export const readStoredDraftRenderImage = (taskId: string, draftId: string): Buffer | null => {
  const artifact = readStoredLatestDraftRenderArtifact(taskId, draftId);
  if (!artifact?.localFilePath || !existsSync(artifact.localFilePath)) {
    return null;
  }
  return Buffer.from(readFileSync(artifact.localFilePath));
};

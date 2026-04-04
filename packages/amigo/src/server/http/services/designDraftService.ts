import {
  getFinalDesignDraftCritiqueHttpPath,
  getFinalDesignDraftPreviewPath,
  getLayoutOptionPreviewPath,
  readCompiledFinalDesignDraftPreview,
  readCompiledLayoutOptionPreview,
  readCompiledModuleDraftPreview,
  readStoredDesignSession,
  readStoredDraftRenderImage,
  readStoredFinalDesignDraft,
  readStoredLatestDraftCritique,
  readStoredLatestDraftRenderArtifact,
  readStoredLayoutDraftOptions,
  readStoredLayoutOptions,
  readStoredThemeOptions,
  setStoredSelectedLayoutId,
  setStoredSelectedThemeId,
  toDraftRenderArtifactHttpDetail,
  toFinalDraftDetail,
  toLayoutDraftOptionHttpDetail,
  toLayoutOptionHttpDetail,
} from "../../appTools/designDraftTools";
import { HttpError } from "../shared/errors";

export const getDesignSessionDetail = (taskId: string) => ({
  success: true,
  taskId,
  session: readStoredDesignSession(taskId),
});

export const getLayoutOptionDetails = (taskId: string) => ({
  success: true,
  taskId,
  modules: readStoredDesignSession(taskId)?.modules || [],
  selectedLayoutId: readStoredDesignSession(taskId)?.selectedLayoutId || null,
  options: readStoredLayoutOptions(taskId).map((option) =>
    toLayoutOptionHttpDetail(taskId, option),
  ),
  draftOptions: readStoredLayoutDraftOptions(taskId).map(toLayoutDraftOptionHttpDetail),
});

export const getThemeOptionDetails = (taskId: string) => ({
  success: true,
  taskId,
  selectedThemeId: readStoredDesignSession(taskId)?.selectedThemeId || null,
  options: readStoredThemeOptions(taskId),
});

export const chooseLayoutOption = (taskId: string, layoutId: string) => {
  const session = readStoredDesignSession(taskId);
  if (!session) {
    throw new HttpError(404, "DESIGN_SESSION_NOT_FOUND", "当前还没有 design session");
  }

  const option = readStoredLayoutOptions(taskId).find((item) => item.layoutId === layoutId);
  if (!option) {
    throw new HttpError(404, "LAYOUT_OPTION_NOT_FOUND", `未找到布局方案 ${layoutId}`);
  }

  const nextSession = setStoredSelectedLayoutId(taskId, layoutId);
  if (!nextSession) {
    throw new HttpError(500, "SELECT_LAYOUT_OPTION_FAILED", "写入布局选择失败");
  }

  return {
    success: true,
    taskId,
    selectedLayoutId: nextSession.selectedLayoutId,
    session: nextSession,
    option,
  };
};

export const chooseThemeOption = (taskId: string, themeId: string) => {
  const session = readStoredDesignSession(taskId);
  if (!session) {
    throw new HttpError(404, "DESIGN_SESSION_NOT_FOUND", "当前还没有 design session");
  }

  if (!session.selectedLayoutId) {
    throw new HttpError(400, "LAYOUT_OPTION_NOT_SELECTED", "请先选择布局方案");
  }

  const option = readStoredThemeOptions(taskId).find((item) => item.themeId === themeId);
  if (!option) {
    throw new HttpError(404, "THEME_OPTION_NOT_FOUND", `未找到主题方案 ${themeId}`);
  }

  const nextSession = setStoredSelectedThemeId(taskId, themeId);
  if (!nextSession) {
    throw new HttpError(500, "SELECT_THEME_OPTION_FAILED", "写入主题选择失败");
  }

  return {
    success: true,
    taskId,
    selectedThemeId: nextSession.selectedThemeId,
    session: nextSession,
    option,
  };
};

export const getFinalDesignDraftDetail = (taskId: string, draftId: string) => {
  const draft = readStoredFinalDesignDraft(taskId, draftId);
  if (!draft) {
    throw new HttpError(404, "FINAL_DESIGN_DRAFT_NOT_FOUND", `未找到最终界面草稿 ${draftId}`);
  }
  const critique = readStoredLatestDraftCritique(taskId, draftId);
  const render = readStoredLatestDraftRenderArtifact(taskId, draftId);

  return {
    success: true,
    taskId,
    draft: {
      ...toFinalDraftDetail(taskId, draft),
      critiquePath: critique ? getFinalDesignDraftCritiqueHttpPath(taskId, draftId) : null,
      renderImagePath: render ? toDraftRenderArtifactHttpDetail(taskId, render).imagePath : null,
    },
  };
};

export const getFinalDesignDraftPreviewHtml = async (taskId: string, draftId: string) =>
  readCompiledFinalDesignDraftPreview(taskId, draftId);

export const getLayoutOptionPreviewHtml = async (taskId: string, layoutId: string) =>
  readCompiledLayoutOptionPreview(taskId, layoutId);

export const getModuleDraftPreviewHtml = async (
  taskId: string,
  draftId: string,
  moduleId: string,
) => readCompiledModuleDraftPreview(taskId, draftId, moduleId);

export const getLatestDraftCritiqueDetail = (taskId: string, draftId: string) => {
  const draft = readStoredFinalDesignDraft(taskId, draftId);
  if (!draft) {
    throw new HttpError(404, "FINAL_DESIGN_DRAFT_NOT_FOUND", `未找到最终界面草稿 ${draftId}`);
  }

  const critique = readStoredLatestDraftCritique(taskId, draftId);
  const render = readStoredLatestDraftRenderArtifact(taskId, draftId);
  return {
    success: true,
    taskId,
    draftId,
    critique,
    render: render ? toDraftRenderArtifactHttpDetail(taskId, render) : null,
  };
};

export const getLatestDraftRenderImage = (taskId: string, draftId: string) => {
  const image = readStoredDraftRenderImage(taskId, draftId);
  if (!image) {
    throw new HttpError(404, "FINAL_DESIGN_DRAFT_RENDER_NOT_FOUND", `未找到草稿 ${draftId} 的截图`);
  }
  return image;
};

export const toFinalDraftHttpSummary = (taskId: string, draftId: string) =>
  getFinalDesignDraftPreviewPath(taskId, draftId);

export const toLayoutOptionHttpSummary = (taskId: string, layoutId: string) =>
  getLayoutOptionPreviewPath(taskId, layoutId);

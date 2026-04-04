import { z } from "zod";
import {
  chooseLayoutOption,
  chooseThemeOption,
  getDesignSessionDetail,
  getFinalDesignDraftDetail,
  getFinalDesignDraftPreviewHtml,
  getLatestDraftCritiqueDetail,
  getLatestDraftRenderImage,
  getLayoutOptionDetails,
  getLayoutOptionPreviewHtml,
  getModuleDraftPreviewHtml,
  getThemeOptionDetails,
} from "../services/designDraftService";
import { parseJsonBody, readTaskIdParam } from "../shared/request";
import { errorResponse, jsonResponse } from "../shared/response";

const chooseLayoutOptionSchema = z.object({
  layoutId: z.string().min(1),
});

const chooseThemeOptionSchema = z.object({
  themeId: z.string().min(1),
});

export const getDesignSessionController = async (_req: Request, match: RegExpMatchArray) => {
  try {
    const taskId = readTaskIdParam(match[1], "INVALID_DESIGN_SESSION_REQUEST");
    return jsonResponse(getDesignSessionDetail(taskId));
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "READ_DESIGN_SESSION_FAILED",
      logLabel: "[AmigoHttp] 读取 design session 失败",
    });
  }
};

export const getLayoutOptionsController = async (_req: Request, match: RegExpMatchArray) => {
  try {
    const taskId = readTaskIdParam(match[1], "INVALID_LAYOUT_OPTIONS_REQUEST");
    return jsonResponse(getLayoutOptionDetails(taskId));
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "READ_LAYOUT_OPTIONS_FAILED",
      logLabel: "[AmigoHttp] 读取 layout options 失败",
    });
  }
};

export const getThemeOptionsController = async (_req: Request, match: RegExpMatchArray) => {
  try {
    const taskId = readTaskIdParam(match[1], "INVALID_THEME_OPTIONS_REQUEST");
    return jsonResponse(getThemeOptionDetails(taskId));
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "READ_THEME_OPTIONS_FAILED",
      logLabel: "[AmigoHttp] 读取 theme options 失败",
    });
  }
};

export const chooseLayoutOptionController = async (req: Request, match: RegExpMatchArray) => {
  try {
    const taskId = readTaskIdParam(match[1], "INVALID_LAYOUT_OPTION_SELECTION_REQUEST");
    const body = await parseJsonBody(
      req,
      chooseLayoutOptionSchema,
      "INVALID_LAYOUT_OPTION_SELECTION_BODY",
    );
    return jsonResponse(chooseLayoutOption(taskId, body.layoutId));
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "SELECT_LAYOUT_OPTION_FAILED",
      logLabel: "[AmigoHttp] 选择 layout option 失败",
    });
  }
};

export const chooseThemeOptionController = async (req: Request, match: RegExpMatchArray) => {
  try {
    const taskId = readTaskIdParam(match[1], "INVALID_THEME_OPTION_SELECTION_REQUEST");
    const body = await parseJsonBody(
      req,
      chooseThemeOptionSchema,
      "INVALID_THEME_OPTION_SELECTION_BODY",
    );
    return jsonResponse(chooseThemeOption(taskId, body.themeId));
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "SELECT_THEME_OPTION_FAILED",
      logLabel: "[AmigoHttp] 选择 theme option 失败",
    });
  }
};

export const getFinalDesignDraftController = async (_req: Request, match: RegExpMatchArray) => {
  try {
    const taskId = readTaskIdParam(match[1], "INVALID_FINAL_DESIGN_DRAFT_REQUEST");
    const draftId = decodeURIComponent(match[2] || "").trim();
    return jsonResponse(getFinalDesignDraftDetail(taskId, draftId));
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "READ_FINAL_DESIGN_DRAFT_FAILED",
      logLabel: "[AmigoHttp] 读取 final design draft 失败",
    });
  }
};

export const previewLayoutOptionController = async (_req: Request, match: RegExpMatchArray) => {
  try {
    const taskId = readTaskIdParam(match[1], "INVALID_LAYOUT_OPTION_PREVIEW_REQUEST");
    const layoutId = decodeURIComponent(match[2] || "").trim();
    const html = await getLayoutOptionPreviewHtml(taskId, layoutId);
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "PREVIEW_LAYOUT_OPTION_FAILED",
      logLabel: "[AmigoHttp] 预览 layout option 失败",
    });
  }
};

export const previewFinalDesignDraftController = async (_req: Request, match: RegExpMatchArray) => {
  try {
    const taskId = readTaskIdParam(match[1], "INVALID_FINAL_DESIGN_DRAFT_PREVIEW_REQUEST");
    const draftId = decodeURIComponent(match[2] || "").trim();
    const html = await getFinalDesignDraftPreviewHtml(taskId, draftId);
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "PREVIEW_FINAL_DESIGN_DRAFT_FAILED",
      logLabel: "[AmigoHttp] 预览 final design draft 失败",
    });
  }
};

export const previewModuleDraftController = async (_req: Request, match: RegExpMatchArray) => {
  try {
    const taskId = readTaskIdParam(match[1], "INVALID_MODULE_DRAFT_PREVIEW_REQUEST");
    const draftId = decodeURIComponent(match[2] || "").trim();
    const moduleId = decodeURIComponent(match[3] || "").trim();
    const html = await getModuleDraftPreviewHtml(taskId, draftId, moduleId);
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "PREVIEW_MODULE_DRAFT_FAILED",
      logLabel: "[AmigoHttp] 预览 module draft 失败",
    });
  }
};

export const getLatestDraftCritiqueController = async (_req: Request, match: RegExpMatchArray) => {
  try {
    const taskId = readTaskIdParam(match[1], "INVALID_FINAL_DESIGN_DRAFT_CRITIQUE_REQUEST");
    const draftId = decodeURIComponent(match[2] || "").trim();
    return jsonResponse(getLatestDraftCritiqueDetail(taskId, draftId));
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "READ_FINAL_DESIGN_DRAFT_CRITIQUE_FAILED",
      logLabel: "[AmigoHttp] 读取 final design draft critique 失败",
    });
  }
};

export const getLatestDraftRenderImageController = async (
  _req: Request,
  match: RegExpMatchArray,
) => {
  try {
    const taskId = readTaskIdParam(match[1], "INVALID_FINAL_DESIGN_DRAFT_RENDER_REQUEST");
    const draftId = decodeURIComponent(match[2] || "").trim();
    const image = getLatestDraftRenderImage(taskId, draftId);
    return new Response(image, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, {
      status: 500,
      code: "READ_FINAL_DESIGN_DRAFT_RENDER_FAILED",
      logLabel: "[AmigoHttp] 读取 final design draft render 失败",
    });
  }
};

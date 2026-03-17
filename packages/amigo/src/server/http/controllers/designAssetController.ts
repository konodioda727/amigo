import { z } from "zod";
import {
  getDesignAssetDetail,
  listDesignAssets,
  saveDesignAsset,
} from "../services/designAssetService";
import { parseJsonBody, readTaskIdParam } from "../shared/request";
import { errorResponse, jsonResponse } from "../shared/response";

const upsertDesignAssetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("component"),
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    tags: z.array(z.string()).optional(),
    markupText: z.string().min(1),
    thumbnailUrl: z.string().url().optional().nullable(),
  }),
  z.object({
    type: z.literal("image"),
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    tags: z.array(z.string()).optional(),
    url: z.string().url(),
    thumbnailUrl: z.string().url().optional().nullable(),
    width: z.number().positive().optional().nullable(),
    height: z.number().positive().optional().nullable(),
  }),
]);

export const listDesignAssetsController = async (_req: Request, match: RegExpMatchArray) => {
  try {
    const taskId = readTaskIdParam(match[1], "INVALID_DESIGN_ASSETS_REQUEST");
    return jsonResponse(listDesignAssets(taskId));
  } catch (error) {
    return errorResponse(error, { status: 500, code: "LIST_DESIGN_ASSETS_FAILED" });
  }
};

export const getDesignAssetController = async (_req: Request, match: RegExpMatchArray) => {
  try {
    const taskId = readTaskIdParam(match[1], "INVALID_DESIGN_ASSET_REQUEST");
    const assetId = decodeURIComponent(match[2] || "").trim();
    return jsonResponse(getDesignAssetDetail(taskId, assetId));
  } catch (error) {
    return errorResponse(error, { status: 500, code: "READ_DESIGN_ASSET_FAILED" });
  }
};

export const upsertDesignAssetController = async (req: Request, match: RegExpMatchArray) => {
  try {
    const taskId = readTaskIdParam(match[1], "INVALID_DESIGN_ASSET_REQUEST");
    const body = await parseJsonBody(req, upsertDesignAssetSchema, "INVALID_DESIGN_ASSET_BODY");
    return jsonResponse(saveDesignAsset(taskId, body));
  } catch (error) {
    return errorResponse(error, { status: 500, code: "WRITE_DESIGN_ASSET_FAILED" });
  }
};

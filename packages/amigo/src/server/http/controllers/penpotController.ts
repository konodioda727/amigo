import { z } from "zod";
import {
  getPenpotBindingDetail,
  importPenpotDesignDoc,
  syncPenpotDesignDoc,
  updatePenpotBinding,
} from "../services/penpotService";
import { parseJsonBody, readTaskPageParams } from "../shared/request";
import { errorResponse, jsonResponse } from "../shared/response";

const penpotBindingRequestSchema = z.object({
  penpotUrl: z.string().url(),
  publicUrl: z.string().url().optional(),
});

export const getPenpotBindingController = async (_req: Request, match: RegExpMatchArray) => {
  try {
    const { taskId, pageId } = readTaskPageParams(
      match[1],
      match[2],
      "INVALID_PENPOT_BINDING_REQUEST",
    );
    return jsonResponse(await getPenpotBindingDetail(taskId, pageId));
  } catch (error) {
    return errorResponse(error, { status: 500, code: "READ_PENPOT_BINDING_FAILED" });
  }
};

export const updatePenpotBindingController = async (req: Request, match: RegExpMatchArray) => {
  try {
    const { taskId, pageId } = readTaskPageParams(
      match[1],
      match[2],
      "INVALID_PENPOT_BINDING_REQUEST",
    );
    const body = await parseJsonBody(
      req,
      penpotBindingRequestSchema,
      "INVALID_PENPOT_BINDING_BODY",
    );
    return jsonResponse(updatePenpotBinding(taskId, pageId, body.penpotUrl, body.publicUrl));
  } catch (error) {
    return errorResponse(error, { status: 500, code: "WRITE_PENPOT_BINDING_FAILED" });
  }
};

export const syncPenpotController = async (_req: Request, match: RegExpMatchArray) => {
  try {
    const { taskId, pageId } = readTaskPageParams(
      match[1],
      match[2],
      "INVALID_PENPOT_SYNC_REQUEST",
    );
    return jsonResponse(await syncPenpotDesignDoc(taskId, pageId));
  } catch (error) {
    return errorResponse(error, {
      status: 502,
      code: "PENPOT_SYNC_FAILED",
    });
  }
};

export const importPenpotController = async (_req: Request, match: RegExpMatchArray) => {
  try {
    const { taskId, pageId } = readTaskPageParams(
      match[1],
      match[2],
      "INVALID_PENPOT_IMPORT_REQUEST",
    );
    return jsonResponse(await importPenpotDesignDoc(taskId, pageId));
  } catch (error) {
    return errorResponse(error, {
      status: 502,
      code: "PENPOT_IMPORT_FAILED",
    });
  }
};

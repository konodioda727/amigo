import { z } from "zod";
import { createUploadPolicy, removeUploadObject } from "../services/ossUploadService";
import { parseJsonBody } from "../shared/request";
import { errorResponse, jsonResponse } from "../shared/response";

const ossPolicyRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  size: z
    .number()
    .int()
    .positive()
    .max(1024 * 1024 * 1024),
});

const ossDeleteRequestSchema = z.object({
  objectKey: z.string().min(1).max(1024),
});

export const createOssPolicyController = async (req: Request) => {
  try {
    const body = await parseJsonBody(req, ossPolicyRequestSchema, "INVALID_OSS_POLICY_REQUEST");
    return jsonResponse(createUploadPolicy(body));
  } catch (error) {
    return errorResponse(error, { status: 502, code: "OSS_POLICY_FAILED" });
  }
};

export const deleteOssObjectController = async (req: Request) => {
  try {
    const body = await parseJsonBody(req, ossDeleteRequestSchema, "INVALID_OSS_DELETE_REQUEST");
    return jsonResponse(await removeUploadObject(body.objectKey));
  } catch (error) {
    return errorResponse(error, { status: 502, code: "OSS_DELETE_FAILED" });
  }
};

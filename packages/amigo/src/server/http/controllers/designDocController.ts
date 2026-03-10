import { getDesignDocDetail, listDesignDocs } from "../services/designDocService";
import { readTaskIdParam, readTaskPageParams } from "../shared/request";
import { errorResponse, jsonResponse } from "../shared/response";

export const listDesignDocsController = async (_req: Request, match: RegExpMatchArray) => {
  try {
    const taskId = readTaskIdParam(match[1]);
    return jsonResponse(listDesignDocs(taskId));
  } catch (error) {
    return errorResponse(error, { status: 500, code: "LIST_DESIGN_DOCS_FAILED" });
  }
};

export const getDesignDocController = async (_req: Request, match: RegExpMatchArray) => {
  try {
    const { taskId, pageId } = readTaskPageParams(match[1], match[2], "INVALID_DESIGN_DOC_REQUEST");
    return jsonResponse(getDesignDocDetail(taskId, pageId));
  } catch (error) {
    return errorResponse(error, { status: 500, code: "READ_DESIGN_DOC_FAILED" });
  }
};

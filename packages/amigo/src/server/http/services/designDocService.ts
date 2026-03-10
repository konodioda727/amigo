import { listStoredDesignDocs, readStoredDesignDoc } from "../../appTools/designDocTools";
import { HttpError } from "../shared/errors";

export const listDesignDocs = (taskId: string) => {
  const items = listStoredDesignDocs(taskId);
  return {
    success: items.length > 0,
    taskId,
    items,
  };
};

export const getDesignDocDetail = (taskId: string, pageId: string) => {
  const result = readStoredDesignDoc(taskId, pageId);
  if (!result) {
    throw new HttpError(404, "DESIGN_DOC_NOT_FOUND", `未找到页面 ${pageId} 的设计稿`);
  }

  return {
    success: result.validation.valid,
    taskId,
    pageId: result.pageId,
    filePath: result.filePath,
    validationErrors: result.validation.errors,
    item: result.stored,
  };
};

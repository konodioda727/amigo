import type { z } from "zod";
import { HttpError } from "./errors";

const decodePathParam = (value: string | undefined) => decodeURIComponent(value || "").trim();

export const readTaskIdParam = (value: string | undefined, code = "INVALID_TASK_ID") => {
  const taskId = decodePathParam(value);
  if (!taskId) {
    throw new HttpError(400, code, "taskId 不能为空");
  }
  return taskId;
};

export const readTaskPageParams = (
  taskValue: string | undefined,
  pageValue: string | undefined,
  code: string,
) => {
  const taskId = decodePathParam(taskValue);
  const pageId = decodePathParam(pageValue);
  if (!taskId || !pageId) {
    throw new HttpError(400, code, "taskId 和 pageId 都不能为空");
  }
  return { taskId, pageId };
};

export const parseJsonBody = async <TSchema extends z.ZodTypeAny>(
  req: Request,
  schema: TSchema,
  code: string,
) => {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, code, "Invalid request body", parsed.error.issues);
  }
  return parsed.data;
};

import { logger } from "@amigo-llm/backend";
import { isHttpError } from "./errors";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type",
} as const;

export const jsonResponse = (data: unknown, init?: ResponseInit): Response => {
  const status = init?.status || 200;
  return new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...(init?.headers || {}),
    },
  });
};

export const noContentResponse = () => jsonResponse({}, { status: 204 });

interface ErrorResponseOptions {
  status: number;
  code: string;
  logLabel?: string;
}

export const errorResponse = (error: unknown, fallback: ErrorResponseOptions) => {
  if (isHttpError(error)) {
    return jsonResponse(
      {
        error: error.message,
        code: error.code,
        ...(error.details !== undefined ? { issues: error.details } : {}),
      },
      { status: error.status },
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  if (fallback.logLabel) {
    logger.error(`${fallback.logLabel}: ${message}`);
  }

  return jsonResponse(
    {
      error: message,
      code: fallback.code,
    },
    { status: fallback.status },
  );
};

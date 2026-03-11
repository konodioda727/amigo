import { conversationRepository, logger, type SandboxRegistry } from "@amigo-llm/backend";
import { z } from "zod";
import type { PreviewHostConfig } from "../config/previewHost";
import {
  getDesignDocController,
  listDesignDocsController,
} from "./controllers/designDocController";
import {
  bootstrapGithubController,
  cancelGithubBootstrapController,
} from "./controllers/githubBootstrapController";
import {
  createOssPolicyController,
  deleteOssObjectController,
} from "./controllers/ossUploadController";
import {
  getPenpotBindingController,
  importPenpotController,
  syncPenpotController,
  updatePenpotBindingController,
} from "./controllers/penpotController";
import { noContentResponse } from "./shared/response";

interface AppHttpRoute {
  method: "GET" | "POST" | "DELETE";
  pattern: RegExp;
  controller: (req: Request, match: RegExpMatchArray) => Promise<Response>;
}

export interface AmigoHttpHandler {
  handle(req: Request): Promise<Response | null>;
  resolveHostedPreviewWebSocketProxyTarget(
    req: Request,
  ): Promise<{ upstreamUrl: string; protocols: string[] } | null>;
}

interface CreateAmigoHttpHandlerOptions {
  sandboxManager: SandboxRegistry;
  previewHostConfig?: PreviewHostConfig;
}

const TASK_EDITOR_OPEN_FILE_PATH_PATTERN = /^\/api\/tasks\/([^/]+)\/editor\/open-file\/?$/;
const TASK_EDITOR_PATH_PATTERN = /^\/api\/tasks\/([^/]+)\/editor\/?$/;
const TASK_PREVIEW_PATH_PATTERN = /^\/api\/tasks\/([^/]+)\/preview\/?$/;
const PREVIEW_PROXY_HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
]);

const normalizeEditorOpenFilePath = (filePath: string): string => {
  const trimmed = filePath.trim();

  if (!trimmed || trimmed === "." || trimmed === "/sandbox" || trimmed === "sandbox") {
    return "/sandbox";
  }

  if (trimmed.startsWith("/sandbox/")) {
    return trimmed;
  }

  if (trimmed.startsWith("sandbox/")) {
    return `/sandbox/${trimmed.slice("sandbox/".length)}`;
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  const normalized = trimmed.replace(/^\.\/+/, "").replace(/^\/+/, "");
  return `/sandbox/${normalized}`;
};

const routes: AppHttpRoute[] = [
  {
    method: "GET",
    pattern: /^\/api\/tasks\/([^/]+)\/design-docs\/?$/,
    controller: listDesignDocsController,
  },
  {
    method: "GET",
    pattern: /^\/api\/tasks\/([^/]+)\/design-docs\/([^/]+)\/?$/,
    controller: getDesignDocController,
  },
  {
    method: "GET",
    pattern: /^\/api\/tasks\/([^/]+)\/penpot\/([^/]+)\/?$/,
    controller: getPenpotBindingController,
  },
  {
    method: "POST",
    pattern: /^\/api\/tasks\/([^/]+)\/penpot\/([^/]+)\/?$/,
    controller: updatePenpotBindingController,
  },
  {
    method: "POST",
    pattern: /^\/api\/tasks\/([^/]+)\/penpot\/([^/]+)\/sync\/?$/,
    controller: syncPenpotController,
  },
  {
    method: "POST",
    pattern: /^\/api\/tasks\/([^/]+)\/penpot\/([^/]+)\/import\/?$/,
    controller: importPenpotController,
  },
  {
    method: "POST",
    pattern: /^\/api\/bootstrap\/github\/?$/,
    controller: (req) => bootstrapGithubController(req),
  },
  {
    method: "DELETE",
    pattern: /^\/api\/bootstrap\/github\/?$/,
    controller: (req) => cancelGithubBootstrapController(req),
  },
  {
    method: "POST",
    pattern: /^\/api\/uploads\/oss\/policy\/?$/,
    controller: (req) => createOssPolicyController(req),
  },
  {
    method: "POST",
    pattern: /^\/api\/uploads\/oss\/delete\/?$/,
    controller: (req) => deleteOssObjectController(req),
  },
];

const editorOpenFileRequestSchema = z.object({
  filePath: z.string().min(1),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
});

const hasRequestBody = (method: string) => !["GET", "HEAD"].includes(method.toUpperCase());

const matchRoute = (method: string, pathname: string) => {
  for (const route of routes) {
    if (route.method !== method) {
      continue;
    }
    const match = pathname.match(route.pattern);
    if (match) {
      return { route, match };
    }
  }
  return null;
};

const normalizeBaseDomain = (value: string | undefined): string =>
  (value || "").trim().toLowerCase().replace(/^\.+/, "").replace(/\.+$/, "");

const isDnsSafeLabel = (value: string): boolean => /^[a-z0-9-]{1,63}$/.test(value);

const jsonResponse = (data: unknown, init?: ResponseInit): Response => {
  const status = init?.status || 200;
  return new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type",
      ...(init?.headers || {}),
    },
  });
};

const matchesAnyRoute = (pathname: string) =>
  routes.some((route) => route.pattern.test(pathname)) ||
  TASK_EDITOR_OPEN_FILE_PATH_PATTERN.test(pathname) ||
  TASK_EDITOR_PATH_PATTERN.test(pathname) ||
  TASK_PREVIEW_PATH_PATTERN.test(pathname);

const getPreviewBaseDomain = (config?: PreviewHostConfig): string | null => {
  const domain = normalizeBaseDomain(config?.baseDomain);
  return domain || null;
};

const buildPreviewPublicUrl = (
  sandboxId: string,
  localPreviewUrl: URL,
  config?: PreviewHostConfig,
): URL => {
  const baseDomain = getPreviewBaseDomain(config);
  if (!baseDomain || !isDnsSafeLabel(sandboxId)) {
    return new URL(localPreviewUrl.toString());
  }

  const publicUrl = new URL(localPreviewUrl.toString());
  const protocol = (config?.publicProtocol || "https").trim().replace(/:$/, "");
  publicUrl.protocol = `${protocol}:`;
  publicUrl.hostname = `${sandboxId}.${baseDomain}`;
  publicUrl.port = "";
  return publicUrl;
};

const resolveSandboxIdFromPreviewHostname = (
  hostname: string,
  config?: PreviewHostConfig,
): string | null => {
  const baseDomain = getPreviewBaseDomain(config);
  if (!baseDomain) {
    return null;
  }

  const normalizedHostname = hostname.trim().toLowerCase();
  const suffix = `.${baseDomain}`;
  if (!normalizedHostname.endsWith(suffix)) {
    return null;
  }

  const label = normalizedHostname.slice(0, -suffix.length);
  if (!label || label.includes(".") || !isDnsSafeLabel(label)) {
    return null;
  }

  return label;
};

export const createAmigoHttpHandler = (
  options: CreateAmigoHttpHandlerOptions,
): AmigoHttpHandler => {
  const resolveSandboxKey = (taskId: string): string | null => {
    const conversation = conversationRepository.load(taskId);
    if (!conversation) {
      return null;
    }

    return conversation.parentId || taskId;
  };

  const parsePositiveInteger = (value: string | null): number | undefined => {
    if (!value) {
      return undefined;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return undefined;
    }

    return parsed;
  };

  const buildTaskEditorRedirectUrl = async (req: Request, sandboxId: string): Promise<URL> => {
    const sandbox = await options.sandboxManager.getOrCreate(sandboxId);
    const requestUrl = new URL(req.url);
    const redirectUrl = new URL(req.url);
    const filePath = requestUrl.searchParams.get("filePath")?.trim();
    const line = parsePositiveInteger(requestUrl.searchParams.get("line"));
    const column = parsePositiveInteger(requestUrl.searchParams.get("column"));

    if (filePath) {
      try {
        await sandbox.queueEditorOpenFile(normalizeEditorOpenFilePath(filePath), line, column);
      } catch (error) {
        logger.warn("[AmigoApp] 写入编辑器打开文件指令失败，将仅打开工作区:", error);
      }
    }

    const editorPort = await sandbox.ensureEditorRunning();
    redirectUrl.protocol = requestUrl.protocol === "https:" ? "http:" : requestUrl.protocol;
    redirectUrl.hostname = requestUrl.hostname;
    redirectUrl.port = String(editorPort);
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    redirectUrl.hash = "";
    redirectUrl.searchParams.set("folder", "/sandbox");

    return redirectUrl;
  };

  const buildTaskPreviewRedirectUrl = async (req: Request, sandboxId: string): Promise<URL> => {
    const sandbox = await options.sandboxManager.getOrCreate(sandboxId);
    const requestUrl = new URL(req.url);
    const redirectUrl = buildPreviewPublicUrl(
      sandboxId,
      sandbox.getDirectPreviewBaseUrl(),
      options.previewHostConfig,
    );
    redirectUrl.search = requestUrl.search;
    return redirectUrl;
  };

  const resolveHostedPreviewSandboxId = (url: URL): string | null => {
    const sandboxId = resolveSandboxIdFromPreviewHostname(url.hostname, options.previewHostConfig);
    if (!sandboxId) {
      return null;
    }

    const conversation =
      conversationRepository.get(sandboxId) || conversationRepository.load(sandboxId);
    return conversation ? sandboxId : null;
  };

  const getHostedPreviewProxyConfig = async (
    req: Request,
  ): Promise<{
    sandboxId: string;
    upstreamUrl: URL;
    previewLogTail: () => Promise<string>;
  } | null> => {
    const requestUrl = new URL(req.url);
    const sandboxId = resolveHostedPreviewSandboxId(requestUrl);
    if (!sandboxId) {
      return null;
    }

    const sandbox = await options.sandboxManager.getOrCreate(sandboxId);
    const upstreamBaseUrl = await sandbox.resolveReachablePreviewBaseUrl();
    const upstreamUrl = new URL(requestUrl.pathname + requestUrl.search, upstreamBaseUrl);

    return {
      sandboxId,
      upstreamUrl,
      previewLogTail: () => sandbox.readPreviewLogTail(80),
    };
  };

  const buildHostedPreviewProxyRequestHeaders = (req: Request): Headers => {
    const requestUrl = new URL(req.url);
    const headers = new Headers();

    for (const [name, value] of req.headers.entries()) {
      if (PREVIEW_PROXY_HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
        continue;
      }
      headers.append(name, value);
    }

    headers.set("x-forwarded-host", requestUrl.host);
    headers.set("x-forwarded-proto", requestUrl.protocol.replace(":", ""));
    return headers;
  };

  const rewriteHostedPreviewLocationHeader = (
    location: string,
    requestUrl: URL,
    upstreamUrl: URL,
  ): string => {
    if (!location.trim()) {
      return location;
    }

    try {
      const resolved = new URL(location, upstreamUrl);
      if (resolved.origin === upstreamUrl.origin) {
        return `${requestUrl.protocol}//${requestUrl.host}${resolved.pathname}${resolved.search}${resolved.hash}`;
      }
      return location;
    } catch {
      return location;
    }
  };

  const proxyHostedPreviewRequest = async (req: Request, sandboxId: string): Promise<Response> => {
    const config = await getHostedPreviewProxyConfig(req);
    if (!config) {
      return jsonResponse(
        {
          error: `任务 ${sandboxId} 不存在`,
          code: "TASK_NOT_FOUND",
        },
        { status: 404 },
      );
    }

    logger.info(
      `[PreviewHost][HTTP] ${req.method} sandbox=${config.sandboxId} path=${new URL(req.url).pathname} upstream=${config.upstreamUrl.toString()}`,
    );

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(config.upstreamUrl, {
        method: req.method,
        headers: buildHostedPreviewProxyRequestHeaders(req),
        body: hasRequestBody(req.method) ? await req.arrayBuffer() : undefined,
        redirect: "manual",
      });
    } catch (error) {
      const previewLog = await config.previewLogTail().catch(() => "");
      logger.error(
        `[PreviewHost][HTTP] 上游请求失败 sandbox=${config.sandboxId} upstream=${config.upstreamUrl.toString()} error=${error instanceof Error ? error.message : String(error)}${previewLog ? `\n最近 dev server 日志:\n${previewLog}` : ""}`,
      );
      throw error;
    }

    const requestUrl = new URL(req.url);
    const headers = new Headers(upstreamResponse.headers);
    const location = headers.get("location");
    if (location) {
      headers.set(
        "location",
        rewriteHostedPreviewLocationHeader(location, requestUrl, config.upstreamUrl),
      );
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers,
    });
  };

  return {
    async handle(req: Request): Promise<Response | null> {
      const url = new URL(req.url);
      const hostedPreviewSandboxId = resolveHostedPreviewSandboxId(url);
      if (hostedPreviewSandboxId) {
        return proxyHostedPreviewRequest(req, hostedPreviewSandboxId);
      }

      if (req.method === "OPTIONS") {
        return matchesAnyRoute(url.pathname) ? noContentResponse() : null;
      }

      const matchedRoute = matchRoute(req.method, url.pathname);
      if (matchedRoute) {
        return matchedRoute.route.controller(req, matchedRoute.match);
      }

      const taskEditorOpenFileRouteMatch = url.pathname.match(TASK_EDITOR_OPEN_FILE_PATH_PATTERN);
      const taskEditorRouteMatch = url.pathname.match(TASK_EDITOR_PATH_PATTERN);
      const taskPreviewRouteMatch = url.pathname.match(TASK_PREVIEW_PATH_PATTERN);

      if (req.method === "POST" && taskEditorOpenFileRouteMatch) {
        const taskId = decodeURIComponent(taskEditorOpenFileRouteMatch[1] || "").trim();
        if (!taskId) {
          return jsonResponse(
            {
              error: "taskId 不能为空",
              code: "INVALID_TASK_ID",
            },
            { status: 400 },
          );
        }

        const sandboxKey = resolveSandboxKey(taskId);
        if (!sandboxKey) {
          return jsonResponse(
            {
              error: `任务 ${taskId} 不存在`,
              code: "TASK_NOT_FOUND",
            },
            { status: 404 },
          );
        }

        const body = await req.json().catch(() => null);
        const parsed = editorOpenFileRequestSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse(
            {
              error: "Invalid request body",
              code: "INVALID_EDITOR_OPEN_FILE_REQUEST",
              issues: parsed.error.issues,
            },
            { status: 400 },
          );
        }

        try {
          const sandbox = await options.sandboxManager.getOrCreate(sandboxKey);
          await sandbox.queueEditorOpenFile(
            normalizeEditorOpenFilePath(parsed.data.filePath),
            parsed.data.line,
            parsed.data.column,
          );
          return jsonResponse({ success: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`[AmigoApp] sandbox editor open-file 失败: ${message}`);
          return jsonResponse(
            {
              error: message,
              code: "SANDBOX_EDITOR_UNAVAILABLE",
            },
            { status: 503 },
          );
        }
      }

      if (req.method === "GET" && taskEditorRouteMatch) {
        const taskId = decodeURIComponent(taskEditorRouteMatch[1] || "").trim();
        if (!taskId) {
          return jsonResponse(
            {
              error: "taskId 不能为空",
              code: "INVALID_TASK_ID",
            },
            { status: 400 },
          );
        }

        const sandboxKey = resolveSandboxKey(taskId);
        if (!sandboxKey) {
          return jsonResponse(
            {
              error: `任务 ${taskId} 不存在`,
              code: "TASK_NOT_FOUND",
            },
            { status: 404 },
          );
        }

        try {
          const redirectUrl = await buildTaskEditorRedirectUrl(req, sandboxKey);
          return Response.redirect(redirectUrl.toString(), 307);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`[AmigoApp] sandbox editor 启动失败: ${message}`);
          return jsonResponse(
            {
              error: message,
              code: "SANDBOX_EDITOR_UNAVAILABLE",
            },
            { status: 503 },
          );
        }
      }

      if (taskPreviewRouteMatch) {
        const taskId = decodeURIComponent(taskPreviewRouteMatch[1] || "").trim();
        if (!taskId) {
          return jsonResponse(
            {
              error: "taskId 不能为空",
              code: "INVALID_TASK_ID",
            },
            { status: 400 },
          );
        }

        const sandboxKey = resolveSandboxKey(taskId);
        if (!sandboxKey) {
          return jsonResponse(
            {
              error: `任务 ${taskId} 不存在`,
              code: "TASK_NOT_FOUND",
            },
            { status: 404 },
          );
        }

        try {
          const redirectUrl = await buildTaskPreviewRedirectUrl(req, sandboxKey);
          return Response.redirect(redirectUrl.toString(), 307);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`[AmigoApp] sandbox preview 启动失败: ${message}`);
          return jsonResponse(
            {
              error: message,
              code: "SANDBOX_PREVIEW_UNAVAILABLE",
            },
            { status: 503 },
          );
        }
      }

      return null;
    },

    async resolveHostedPreviewWebSocketProxyTarget(
      req: Request,
    ): Promise<{ upstreamUrl: string; protocols: string[] } | null> {
      const config = await getHostedPreviewProxyConfig(req);
      if (!config) {
        return null;
      }

      const upstreamUrl = new URL(config.upstreamUrl.toString());
      upstreamUrl.protocol = upstreamUrl.protocol === "https:" ? "wss:" : "ws:";
      const protocols = (req.headers.get("sec-websocket-protocol") || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

      return {
        upstreamUrl: upstreamUrl.toString(),
        protocols,
      };
    },
  };
};

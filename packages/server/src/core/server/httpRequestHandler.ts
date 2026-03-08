import { z } from "zod";
import { listStoredDesignDocs, readStoredDesignDoc } from "@/appTools/designDocs";
import { getPenpotBaseUrl, readPenpotBinding, writePenpotBinding } from "@/appTools/penpotBindings";
import { syncDesignDocToPenpot } from "@/appTools/penpotSync";
import { conversationRepository } from "@/core/conversation";
import { sandboxRegistry } from "@/core/sandbox";
import { logger } from "@/utils/logger";
import { createOssPostPolicy, deleteOssObject, getOssUploadConfig } from "@/utils/ossUpload";

const TASK_EDITOR_OPEN_FILE_PATH_PATTERN = /^\/api\/tasks\/([^/]+)\/editor\/open-file\/?$/;
const TASK_EDITOR_PATH_PATTERN = /^\/api\/tasks\/([^/]+)\/editor\/?$/;
const DESIGN_DOCS_PATH_PATTERN = /^\/api\/tasks\/([^/]+)\/design-docs\/?$/;
const DESIGN_DOC_PATH_PATTERN = /^\/api\/tasks\/([^/]+)\/design-docs\/([^/]+)\/?$/;
const PENPOT_BINDING_PATH_PATTERN = /^\/api\/tasks\/([^/]+)\/penpot\/([^/]+)\/?$/;
const PENPOT_SYNC_PATH_PATTERN = /^\/api\/tasks\/([^/]+)\/penpot\/([^/]+)\/sync\/?$/;

const editorOpenFileRequestSchema = z.object({
  filePath: z.string().min(1),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
});

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

const penpotBindingRequestSchema = z.object({
  penpotUrl: z.string().url(),
});

export class ServerHttpRequestHandler {
  async handle(req: Request): Promise<Response | null> {
    const url = new URL(req.url);
    const taskEditorOpenFileRouteMatch = url.pathname.match(TASK_EDITOR_OPEN_FILE_PATH_PATTERN);
    const taskEditorRouteMatch = url.pathname.match(TASK_EDITOR_PATH_PATTERN);
    const designDocsRouteMatch = url.pathname.match(DESIGN_DOCS_PATH_PATTERN);
    const designDocRouteMatch = url.pathname.match(DESIGN_DOC_PATH_PATTERN);
    const penpotBindingRouteMatch = url.pathname.match(PENPOT_BINDING_PATH_PATTERN);
    const penpotSyncRouteMatch = url.pathname.match(PENPOT_SYNC_PATH_PATTERN);

    if (
      req.method === "OPTIONS" &&
      (taskEditorOpenFileRouteMatch ||
        taskEditorRouteMatch ||
        designDocsRouteMatch ||
        designDocRouteMatch ||
        penpotBindingRouteMatch ||
        penpotSyncRouteMatch)
    ) {
      return this.jsonResponse({}, { status: 204 });
    }

    if (req.method === "POST" && taskEditorOpenFileRouteMatch) {
      return this.handleTaskEditorOpenFileRequest(req, taskEditorOpenFileRouteMatch);
    }

    if (req.method === "GET" && taskEditorRouteMatch) {
      return this.handleTaskEditorRedirect(req, taskEditorRouteMatch);
    }

    if (req.method === "GET" && designDocsRouteMatch) {
      return this.handleDesignDocsIndexRequest(designDocsRouteMatch);
    }

    if (req.method === "GET" && designDocRouteMatch) {
      return this.handleDesignDocReadRequest(designDocRouteMatch);
    }

    if (req.method === "GET" && penpotBindingRouteMatch) {
      return this.handlePenpotBindingReadRequest(penpotBindingRouteMatch);
    }

    if (req.method === "POST" && penpotBindingRouteMatch) {
      return this.handlePenpotBindingWriteRequest(req, penpotBindingRouteMatch);
    }

    if (req.method === "POST" && penpotSyncRouteMatch) {
      return this.handlePenpotSyncRequest(penpotSyncRouteMatch);
    }

    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/uploads/oss/")) {
      return this.jsonResponse({}, { status: 204 });
    }

    if (req.method === "POST" && url.pathname === "/api/uploads/oss/policy") {
      return this.handleOssPolicyRequest(req);
    }

    if (req.method === "POST" && url.pathname === "/api/uploads/oss/delete") {
      return this.handleOssDeleteRequest(req);
    }

    return null;
  }

  private async handleTaskEditorOpenFileRequest(
    req: Request,
    routeMatch: RegExpMatchArray,
  ): Promise<Response> {
    const taskId = decodeURIComponent(routeMatch[1] || "").trim();
    if (!taskId) {
      return this.jsonResponse(
        {
          error: "taskId 不能为空",
          code: "INVALID_TASK_ID",
        },
        { status: 400 },
      );
    }

    const sandboxKey = this.resolveSandboxKey(taskId);
    if (!sandboxKey) {
      return this.jsonResponse(
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
      return this.jsonResponse(
        {
          error: "Invalid request body",
          code: "INVALID_EDITOR_OPEN_FILE_REQUEST",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    try {
      const sandbox = await sandboxRegistry.getOrCreate(sandboxKey);
      await sandbox.queueEditorOpenFile(
        this.normalizeSandboxFilePath(parsed.data.filePath),
        parsed.data.line,
        parsed.data.column,
      );
      return this.jsonResponse({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[Server] sandbox editor open-file 失败: ${message}`);
      return this.jsonResponse(
        {
          error: message,
          code: "SANDBOX_EDITOR_UNAVAILABLE",
        },
        { status: 503 },
      );
    }
  }

  private async handleTaskEditorRedirect(
    req: Request,
    routeMatch: RegExpMatchArray,
  ): Promise<Response> {
    const taskId = decodeURIComponent(routeMatch[1] || "").trim();
    if (!taskId) {
      return this.jsonResponse(
        {
          error: "taskId 不能为空",
          code: "INVALID_TASK_ID",
        },
        { status: 400 },
      );
    }

    const sandboxKey = this.resolveSandboxKey(taskId);
    if (!sandboxKey) {
      return this.jsonResponse(
        {
          error: `任务 ${taskId} 不存在`,
          code: "TASK_NOT_FOUND",
        },
        { status: 404 },
      );
    }

    try {
      const redirectUrl = await this.buildTaskEditorRedirectUrl(req, sandboxKey);
      return Response.redirect(redirectUrl.toString(), 307);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[Server] sandbox editor 启动失败: ${message}`);
      return this.jsonResponse(
        {
          error: message,
          code: "SANDBOX_EDITOR_UNAVAILABLE",
        },
        { status: 503 },
      );
    }
  }

  private async handleOssPolicyRequest(req: Request): Promise<Response> {
    const ossConfig = getOssUploadConfig();
    if (!ossConfig) {
      return this.jsonResponse(
        {
          error: "OSS upload is not configured",
          code: "OSS_NOT_CONFIGURED",
        },
        { status: 501 },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = ossPolicyRequestSchema.safeParse(body);
    if (!parsed.success) {
      return this.jsonResponse(
        {
          error: "Invalid request body",
          code: "INVALID_OSS_POLICY_REQUEST",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    return this.jsonResponse({
      provider: "aliyun-oss",
      ...createOssPostPolicy(ossConfig, parsed.data),
    });
  }

  private async handleOssDeleteRequest(req: Request): Promise<Response> {
    const ossConfig = getOssUploadConfig();
    if (!ossConfig) {
      return this.jsonResponse(
        {
          error: "OSS upload is not configured",
          code: "OSS_NOT_CONFIGURED",
        },
        { status: 501 },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = ossDeleteRequestSchema.safeParse(body);
    if (!parsed.success) {
      return this.jsonResponse(
        {
          error: "Invalid request body",
          code: "INVALID_OSS_DELETE_REQUEST",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    try {
      await deleteOssObject(ossConfig, parsed.data.objectKey);
      return this.jsonResponse({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.jsonResponse(
        {
          error: message,
          code: "OSS_DELETE_FAILED",
        },
        { status: 502 },
      );
    }
  }

  private handleDesignDocsIndexRequest(routeMatch: RegExpMatchArray): Response {
    const taskId = decodeURIComponent(routeMatch[1] || "").trim();
    if (!taskId) {
      return this.jsonResponse(
        {
          error: "taskId 不能为空",
          code: "INVALID_TASK_ID",
        },
        { status: 400 },
      );
    }

    const docs = listStoredDesignDocs(taskId);
    return this.jsonResponse({
      success: docs.length > 0,
      taskId,
      items: docs,
    });
  }

  private handleDesignDocReadRequest(routeMatch: RegExpMatchArray): Response {
    const taskId = decodeURIComponent(routeMatch[1] || "").trim();
    const pageId = decodeURIComponent(routeMatch[2] || "").trim();

    if (!taskId || !pageId) {
      return this.jsonResponse(
        {
          error: "taskId 和 pageId 都不能为空",
          code: "INVALID_DESIGN_DOC_REQUEST",
        },
        { status: 400 },
      );
    }

    const result = readStoredDesignDoc(taskId, pageId);
    if (!result) {
      return this.jsonResponse(
        {
          error: `未找到页面 ${pageId} 的设计稿`,
          code: "DESIGN_DOC_NOT_FOUND",
        },
        { status: 404 },
      );
    }

    return this.jsonResponse({
      success: result.validation.valid,
      taskId,
      pageId: result.pageId,
      filePath: result.filePath,
      validationErrors: result.validation.errors,
      item: result.stored,
    });
  }

  private handlePenpotBindingReadRequest(routeMatch: RegExpMatchArray): Response {
    const taskId = decodeURIComponent(routeMatch[1] || "").trim();
    const pageId = decodeURIComponent(routeMatch[2] || "").trim();

    if (!taskId || !pageId) {
      return this.jsonResponse(
        {
          error: "taskId 和 pageId 都不能为空",
          code: "INVALID_PENPOT_BINDING_REQUEST",
        },
        { status: 400 },
      );
    }

    const binding = readPenpotBinding(taskId, pageId);
    return this.jsonResponse({
      success: true,
      taskId,
      pageId,
      penpotBaseUrl: getPenpotBaseUrl(),
      binding,
      activeUrl: binding?.penpotUrl || getPenpotBaseUrl(),
    });
  }

  private async handlePenpotBindingWriteRequest(
    req: Request,
    routeMatch: RegExpMatchArray,
  ): Promise<Response> {
    const taskId = decodeURIComponent(routeMatch[1] || "").trim();
    const pageId = decodeURIComponent(routeMatch[2] || "").trim();

    if (!taskId || !pageId) {
      return this.jsonResponse(
        {
          error: "taskId 和 pageId 都不能为空",
          code: "INVALID_PENPOT_BINDING_REQUEST",
        },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = penpotBindingRequestSchema.safeParse(body);
    if (!parsed.success) {
      return this.jsonResponse(
        {
          error: "Invalid request body",
          code: "INVALID_PENPOT_BINDING_BODY",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const binding = writePenpotBinding(taskId, pageId, parsed.data.penpotUrl);
    return this.jsonResponse({
      success: true,
      taskId,
      pageId,
      penpotBaseUrl: getPenpotBaseUrl(),
      binding,
      activeUrl: binding.penpotUrl,
    });
  }

  private async handlePenpotSyncRequest(routeMatch: RegExpMatchArray): Promise<Response> {
    const taskId = decodeURIComponent(routeMatch[1] || "").trim();
    const pageId = decodeURIComponent(routeMatch[2] || "").trim();

    if (!taskId || !pageId) {
      return this.jsonResponse(
        {
          error: "taskId 和 pageId 都不能为空",
          code: "INVALID_PENPOT_SYNC_REQUEST",
        },
        { status: 400 },
      );
    }

    try {
      const result = await syncDesignDocToPenpot(taskId, pageId);
      return this.jsonResponse({
        success: true,
        taskId,
        sourcePageId: pageId,
        ...result,
      });
    } catch (error) {
      return this.jsonResponse(
        {
          error: error instanceof Error ? error.message : String(error),
          code: "PENPOT_SYNC_FAILED",
        },
        { status: 502 },
      );
    }
  }

  private resolveSandboxKey(taskId: string): string | null {
    const conversation = conversationRepository.load(taskId);
    if (!conversation) {
      return null;
    }

    return conversation.parentId || taskId;
  }

  private normalizeSandboxFilePath(filePath: string): string {
    return filePath.replace(/^(\.\/|\/)+/, "");
  }

  private parsePositiveInteger(value: string | null): number | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return undefined;
    }

    return parsed;
  }

  private async buildTaskEditorRedirectUrl(req: Request, sandboxId: string): Promise<URL> {
    const sandbox = await sandboxRegistry.getOrCreate(sandboxId);
    const requestUrl = new URL(req.url);
    const redirectUrl = new URL(req.url);
    const filePath = requestUrl.searchParams.get("filePath")?.trim();
    const line = this.parsePositiveInteger(requestUrl.searchParams.get("line"));
    const column = this.parsePositiveInteger(requestUrl.searchParams.get("column"));

    if (filePath) {
      try {
        await sandbox.queueEditorOpenFile(this.normalizeSandboxFilePath(filePath), line, column);
      } catch (error) {
        logger.warn("[Server] 写入编辑器打开文件指令失败，将仅打开工作区:", error);
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
  }

  private jsonResponse(data: unknown, init?: ResponseInit): Response {
    const status = init?.status || 200;
    return new Response(status === 204 ? null : JSON.stringify(data), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
        ...(init?.headers || {}),
      },
    });
  }
}

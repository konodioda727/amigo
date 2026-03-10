import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defineTool, getTaskStoragePath, logger } from "@amigo-llm/backend";
import { type ExecutableDesignDoc, validateExecutableDesignDoc } from "./designDocSchema";
import { resolveDesignDocOwnerTaskId } from "./designDocScope";

const DESIGN_DOCS_DIRNAME = "designDocs";
const DESIGN_DOC_SCHEMA_VERSION = 3;

export interface StoredDesignDoc {
  schemaVersion: number;
  pageId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  document: ExecutableDesignDoc | Record<string, unknown>;
}

export const writeStoredDesignDoc = (taskId: string, pageId: string, stored: StoredDesignDoc) => {
  const docsPath = getDesignDocsPath(taskId);
  const normalizedPageId = normalizePageId(pageId);
  const filePath = path.join(docsPath, `${normalizedPageId}.json`);
  ensureDirectoryExists(docsPath);
  writeFileSync(filePath, `${JSON.stringify(stored, null, 2)}\n`, "utf-8");
  return filePath;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const normalizePageId = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const getDesignDocsPath = (taskId: string) =>
  path.join(getTaskStoragePath(taskId), DESIGN_DOCS_DIRNAME);

const ensureDirectoryExists = (directory: string) => {
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
};

const parseDocumentContent = (
  content: unknown,
): { document: Record<string, unknown> | null; error?: string } => {
  if (typeof content !== "string" || !content.trim()) {
    return { document: null, error: "content 必须是非空 JSON 字符串" };
  }

  try {
    const parsed = JSON.parse(content);
    if (!isPlainObject(parsed)) {
      return { document: null, error: "content 必须是 JSON object，不能是数组或基础类型" };
    }
    return { document: parsed };
  } catch (error) {
    return {
      document: null,
      error: `content 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const deepMerge = (
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(patch)) {
    const existing = result[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      result[key] = deepMerge(existing, value);
      continue;
    }
    result[key] = value;
  }

  return result;
};

const replaceLines = (
  source: string,
  replacement: string,
  startLine: number,
  endLine: number,
): { content: string | null; error?: string } => {
  const normalizedStart = Math.max(1, Math.trunc(startLine));
  const normalizedEnd = Math.max(normalizedStart, Math.trunc(endLine));
  const sourceLines = source.split("\n");

  if (normalizedStart > sourceLines.length) {
    return {
      content: null,
      error: `startLine 超出范围：当前设计稿只有 ${sourceLines.length} 行`,
    };
  }

  if (normalizedEnd > sourceLines.length) {
    return {
      content: null,
      error: `endLine 超出范围：当前设计稿只有 ${sourceLines.length} 行`,
    };
  }

  const replacementLines = replacement.replace(/\r\n/g, "\n").split("\n");
  const nextLines = [
    ...sourceLines.slice(0, normalizedStart - 1),
    ...replacementLines,
    ...sourceLines.slice(normalizedEnd),
  ];

  return {
    content: nextLines.join("\n"),
  };
};

const addLineNumbers = (content: string) =>
  content
    .split("\n")
    .map((line, index) => `${String(index + 1).padStart(4, " ")}| ${line}`)
    .join("\n");

const getStoredDocumentSummary = (document: StoredDesignDoc["document"]) => {
  const page = isPlainObject(document.page) ? document.page : null;
  const sections = Array.isArray(document.sections) ? document.sections : [];

  return {
    pageName: typeof page?.name === "string" ? page.name : undefined,
    width: typeof page?.width === "number" ? page.width : undefined,
    minHeight: typeof page?.minHeight === "number" ? page.minHeight : undefined,
    sectionCount: sections.length,
  };
};

export const loadStoredDesignDoc = (filePath: string): StoredDesignDoc | null => {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    if (
      !isPlainObject(parsed) ||
      !isPlainObject(parsed.document) ||
      typeof parsed.pageId !== "string"
    ) {
      return null;
    }

    return {
      schemaVersion: Number(parsed.schemaVersion) || 1,
      pageId: parsed.pageId,
      title: typeof parsed.title === "string" ? parsed.title : null,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      document: parsed.document,
    };
  } catch (error) {
    logger.warn("[DesignDocs] 读取设计稿失败:", filePath, error);
    return null;
  }
};

export const listStoredDesignDocs = (taskId: string) => {
  const docsPath = getDesignDocsPath(taskId);
  if (!existsSync(docsPath)) {
    return [];
  }

  return readdirSync(docsPath)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const filePath = path.join(docsPath, name);
      const stored = loadStoredDesignDoc(filePath);
      const validation =
        stored && isPlainObject(stored.document)
          ? validateExecutableDesignDoc(stored.document)
          : { valid: false as const, document: null, errors: ["document: 设计稿文件损坏"] };

      return {
        pageId: stored?.pageId || name.replace(/\.json$/i, ""),
        title: stored?.title || null,
        updatedAt: stored?.updatedAt || null,
        schemaVersion: stored?.schemaVersion || 0,
        valid: validation.valid,
      };
    });
};

export const readStoredDesignDoc = (taskId: string, pageId: string) => {
  const normalizedPageId = normalizePageId(pageId);
  const filePath = path.join(getDesignDocsPath(taskId), `${normalizedPageId}.json`);
  const stored = loadStoredDesignDoc(filePath);
  if (!stored || !isPlainObject(stored.document)) {
    return null;
  }

  const validation = validateExecutableDesignDoc(stored.document);
  return {
    pageId: normalizedPageId,
    filePath,
    stored,
    validation,
  };
};

export const editDesignDocTool = defineTool({
  name: "editDesignDoc",
  description:
    "为当前任务创建或更新页面设计稿 JSON 文件，要求使用可执行的 design doc v3 schema。若传入 startLine/endLine，则按 readDesignDoc 返回的 content 行号做局部替换。",
  whenToUse:
    "在 UI/页面/组件实现前先产出设计稿；或在代码实现前需要更新既有页面设计决策时使用。设计稿必须可复用、可集成，不能只写自然语言描述。若页面已有设计稿，默认先 readDesignDoc；若只需小范围修改，优先用 startLine/endLine 局部替换；只有用户已同意的情况下，才整份重写。",
  params: [
    {
      name: "pageId",
      optional: false,
      description: "页面或视图标识，推荐 kebab-case，例如 home-page、settings-profile",
    },
    {
      name: "title",
      optional: true,
      description: "设计稿标题，便于后续检索；可与页面名称一致",
    },
    {
      name: "content",
      optional: false,
      description:
        "不传 startLine/endLine 时，这里填写完整设计稿 JSON 字符串，按 v3 schema 填写，根字段只能有 page、designTokens、sections。page 只填 name/path/width/minHeight/background；designTokens 只填 colors、spacing、radius、typography，字号/字重/行高/间距/圆角都使用 number，颜色全部使用十六进制，其中 typography.lineHeight 必须填写最终整数像素值，例如 24、32、72，不能写 1.2 这类倍率，也不能写 24.5 这类小数；sections 是页面区块数组，每个 section 都必须填写 id/name/kind/y/height/layout/nodes。layout.mode 只填 absolute/stack/grid，layout.direction 只填 horizontal/vertical，alignX/alignY 只填 start/center/end/stretch，layout.padding 写成 {top,right,bottom,left}。每个 node 都必须填写 id/name/type/x/y/width/height，其中 x/y/width/height 是最终可落到 Penpot 的绝对布局结果；type 只使用 container、text、button、image、shape；如果需要图层顺序可填写 zIndex；只有 section 才能写 nodes，普通 node 如果需要嵌套子节点，只能写 children，不能写 nodes；text/button 节点填写真实 text，image 节点填写 assetUrl，如需表达展示方式可填写 imageFit，值只填 cover/contain/fill；shape 节点如需表达具体形状可填写 shapeKind，值只填 rect/ellipse/line。style 只能填写 fill、fills、stroke、radius、opacity、textColor、fontToken、fontSize、fontWeight、align、shadow；文本对齐只能写 style.align，值只填 left/center/right，不能写 textAlign；如果需要填充色，style.fill 写成对象，例如 {type:'solid',color:'#B9924C',opacity:1}；如果需要描边，style.stroke 也必须写成对象，例如 {color:'#2A2F36',width:1,opacity:1}；如果需要阴影，style.shadow 也必须写成对象，例如 {x:0,y:12,blur:32,color:'#000000',opacity:0.18}；fill.color、stroke.color、shadow.color 都使用十六进制。若传入 startLine/endLine，这里改为填写用于替换对应行范围的 JSON 片段文本。",
    },
    {
      name: "mergeWithExisting",
      optional: true,
      description: "是否与现有设计稿做对象级合并。默认 false；数组字段会整体替换。",
    },
    {
      name: "startLine",
      optional: true,
      description:
        "可选。若提供，则进入按行修改模式。行号基于 readDesignDoc 返回的 content，表示替换起始行（从 1 开始）。",
    },
    {
      name: "endLine",
      optional: true,
      description:
        "可选。若提供，则进入按行修改模式。行号基于 readDesignDoc 返回的 content，表示替换结束行（包含）；不传时默认等于 startLine。",
    },
  ],
  async invoke({ params, context }) {
    const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
    if (!ownerTaskId) {
      const message = "taskId 不能为空";
      return {
        message,
        toolResult: {
          success: false,
          pageId: "",
          validationErrors: ["taskId 不能为空"],
          message,
        },
      };
    }

    const normalizedPageId = normalizePageId(String(params.pageId || ""));
    if (!normalizedPageId) {
      const message = "pageId 不能为空，且只能包含可归一化的页面标识";
      return {
        message,
        toolResult: {
          success: false,
          pageId: "",
          validationErrors: ["pageId 非法"],
          message,
        },
      };
    }

    const docsPath = getDesignDocsPath(ownerTaskId);
    const filePath = path.join(docsPath, `${normalizedPageId}.json`);
    const shouldMerge = params.mergeWithExisting === true || params.mergeWithExisting === "true";
    const hasLineRange = params.startLine !== undefined || params.endLine !== undefined;
    const startLine = params.startLine !== undefined ? Number(params.startLine) : undefined;
    const endLine = params.endLine !== undefined ? Number(params.endLine) : undefined;

    try {
      ensureDirectoryExists(docsPath);
      const existing = loadStoredDesignDoc(filePath);
      let mergedDocument: Record<string, unknown>;

      if (hasLineRange) {
        if (
          startLine === undefined ||
          !Number.isFinite(startLine) ||
          startLine < 1 ||
          (endLine !== undefined && (!Number.isFinite(endLine) || endLine < startLine))
        ) {
          const message =
            "startLine/endLine 非法，必须是从 1 开始的有效行号，且 endLine 不能小于 startLine";
          return {
            message,
            toolResult: {
              success: false,
              pageId: normalizedPageId,
              validationErrors: [message],
              message,
            },
          };
        }

        if (!existing || !isPlainObject(existing.document)) {
          const message = "按行修改设计稿前，必须先存在一份可读取的设计稿";
          return {
            message,
            toolResult: {
              success: false,
              pageId: normalizedPageId,
              validationErrors: [message],
              message,
            },
          };
        }

        const currentDocumentContent = JSON.stringify(existing.document, null, 2);
        const linePatch = replaceLines(
          currentDocumentContent,
          String(params.content ?? ""),
          startLine,
          endLine ?? startLine,
        );

        if (!linePatch.content) {
          const message = linePatch.error || "按行修改设计稿失败";
          return {
            message,
            toolResult: {
              success: false,
              pageId: normalizedPageId,
              validationErrors: [message],
              message,
            },
          };
        }

        const patchedDocumentResult = parseDocumentContent(linePatch.content);
        if (!patchedDocumentResult.document) {
          const message = patchedDocumentResult.error || "按行修改后不是合法 JSON";
          return {
            message,
            toolResult: {
              success: false,
              pageId: normalizedPageId,
              validationErrors: [message],
              message,
            },
          };
        }

        mergedDocument = patchedDocumentResult.document;
      } else {
        const { document, error } = parseDocumentContent(params.content);
        if (!document) {
          const message = error || "设计稿解析失败";
          return {
            message,
            toolResult: {
              success: false,
              pageId: normalizedPageId,
              validationErrors: [message],
              message,
            },
          };
        }

        mergedDocument =
          shouldMerge && existing && isPlainObject(existing.document)
            ? deepMerge(existing.document, document)
            : document;
      }

      const validation = validateExecutableDesignDoc(mergedDocument);

      if (!validation.valid || !validation.document) {
        const message = `设计稿未通过 v3 schema 校验，共 ${validation.errors.length} 个错误`;
        return {
          message,
          toolResult: {
            success: false,
            pageId: normalizedPageId,
            validationErrors: validation.errors,
            message,
          },
        };
      }

      const now = new Date().toISOString();
      const stored: StoredDesignDoc = {
        schemaVersion: DESIGN_DOC_SCHEMA_VERSION,
        pageId: normalizedPageId,
        title:
          typeof params.title === "string" && params.title.trim()
            ? params.title.trim()
            : existing?.title || validation.document.page.name,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        document: validation.document,
      };

      writeStoredDesignDoc(ownerTaskId, normalizedPageId, stored);
      let penpotSync:
        | {
            success: true;
            fileUrl: string;
          }
        | {
            success: false;
            error: string;
          }
        | undefined;

      try {
        const { syncDesignDocToPenpot } = await import("./penpotSync");
        const syncResult = await syncDesignDocToPenpot(ownerTaskId, normalizedPageId);
        penpotSync = {
          success: true,
          fileUrl: syncResult.fileUrl,
        };
      } catch (syncError) {
        penpotSync = {
          success: false,
          error: syncError instanceof Error ? syncError.message : String(syncError),
        };
      }

      const message =
        penpotSync?.success === false
          ? `已保存设计稿: ${normalizedPageId}，但同步到 Penpot 失败`
          : `已保存设计稿并同步到 Penpot: ${normalizedPageId}`;
      return {
        message,
        toolResult: {
          success: true,
          pageId: normalizedPageId,
          startLine: hasLineRange ? startLine : undefined,
          endLine: hasLineRange ? (endLine ?? startLine) : undefined,
          title: stored.title,
          updatedAt: stored.updatedAt,
          summary: getStoredDocumentSummary(stored.document),
          penpotSync,
          validationErrors: [],
          message,
        },
      };
    } catch (writeError) {
      const message = `保存设计稿失败: ${writeError instanceof Error ? writeError.message : String(writeError)}`;
      logger.error("[DesignDocs] editDesignDoc error:", writeError);
      return {
        message,
        toolResult: {
          success: false,
          pageId: normalizedPageId,
          validationErrors: [message],
          message,
        },
      };
    }
  },
});

export const readDesignDocTool = defineTool({
  name: "readDesignDoc",
  description:
    "读取当前任务已保存的页面设计稿 JSON。若传入 pageId，返回该页面带行号的 content；若不传 pageId，则返回设计稿索引。",
  whenToUse:
    "在编写或修改 UI 代码前先读取对应页面设计稿。返回的 content 自带行号，可直接用于定位 startLine/endLine；或者先列出当前任务有哪些设计稿可复用。",
  params: [
    {
      name: "pageId",
      optional: true,
      description: "要读取的页面标识；为空时仅返回当前任务下的设计稿索引",
    },
  ],
  async invoke({ params, context }) {
    const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
    if (!ownerTaskId) {
      const message = "taskId 不能为空";
      return {
        message,
        toolResult: {
          success: false,
          pageId: "",
          content: "",
          availableDocs: [],
          validationErrors: ["taskId 不能为空"],
          message,
        },
      };
    }

    const docsPath = getDesignDocsPath(ownerTaskId);
    if (!existsSync(docsPath)) {
      const message = "当前任务还没有任何设计稿";
      return {
        message,
        toolResult: {
          success: false,
          pageId: "",
          content: "",
          availableDocs: [],
          validationErrors: [],
          message,
        },
      };
    }

    const pageId = typeof params.pageId === "string" ? normalizePageId(params.pageId) : "";

    try {
      if (!pageId) {
        const availableDocs = listStoredDesignDocs(ownerTaskId);
        const message =
          availableDocs.length === 0
            ? "当前任务还没有任何设计稿"
            : `当前任务共有 ${availableDocs.length} 份设计稿`;
        return {
          message,
          toolResult: {
            success: availableDocs.length > 0,
            pageId: "",
            content: "",
            availableDocs,
            validationErrors: [],
            message,
          },
        };
      }

      const readResult = readStoredDesignDoc(ownerTaskId, pageId);
      if (!readResult) {
        const message = `未找到页面 ${pageId} 的设计稿`;
        return {
          message,
          toolResult: {
            success: false,
            pageId,
            content: "",
            availableDocs: [],
            validationErrors: [message],
            message,
          },
        };
      }

      const content = addLineNumbers(JSON.stringify(readResult.stored.document, null, 2));
      const message = readResult.validation.valid
        ? `已读取设计稿: ${pageId}`
        : `已读取设计稿: ${pageId}，但未通过 v3 schema 校验`;
      return {
        message,
        toolResult: {
          success: true,
          pageId,
          content,
          summary: {
            title: readResult.stored.title,
            ...getStoredDocumentSummary(readResult.stored.document),
            updatedAt: readResult.stored.updatedAt,
          },
          availableDocs: [],
          validationErrors: readResult.validation.errors,
          message,
        },
      };
    } catch (readError) {
      const message = `读取设计稿失败: ${readError instanceof Error ? readError.message : String(readError)}`;
      logger.error("[DesignDocs] readDesignDoc error:", readError);
      return {
        message,
        toolResult: {
          success: false,
          pageId,
          content: "",
          availableDocs: [],
          validationErrors: [message],
          message,
        },
      };
    }
  },
});

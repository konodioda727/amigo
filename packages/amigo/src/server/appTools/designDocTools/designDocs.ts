import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defineTool, getTaskStoragePath, logger } from "@amigo-llm/backend";
import { listAvailableDesignAssets, upsertStoredDesignComponent } from "./designAssets";
import type { ExecutableDesignDoc } from "./designDocSchema";
import { validateExecutableDesignDoc } from "./designDocSchema";
import { resolveDesignDocOwnerTaskId } from "./designDocScope";
import {
  compileDesignDocFromMarkup,
  compileDesignDocSectionsFromMarkup,
  compileDesignSectionFromMarkup,
  extractInlineComponentDefinitionsFromMarkup,
  serializeDesignDocToMarkup,
} from "./designMarkupCompiler";
import { parsePenpotBindingUrl, readPenpotBinding } from "./penpotBindings";

const DESIGN_DOCS_DIRNAME = "designDocs";
const DESIGN_DOC_SCHEMA_VERSION = 3;
const PLACEHOLDER_PATTERN =
  /(todo|tbd|placeholder|lorem ipsum|示意|待补|后续补充|example\.com|picsum\.photos)/i;

export interface StoredDesignDoc {
  schemaVersion: number;
  pageId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  document: ExecutableDesignDoc | Record<string, unknown>;
}

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

export const writeStoredDesignDoc = (taskId: string, pageId: string, stored: StoredDesignDoc) => {
  const docsPath = getDesignDocsPath(taskId);
  const normalizedPageId = normalizePageId(pageId);
  const filePath = path.join(docsPath, `${normalizedPageId}.json`);
  ensureDirectoryExists(docsPath);
  writeFileSync(filePath, `${JSON.stringify(stored, null, 2)}\n`, "utf-8");
  return filePath;
};

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

const getPenpotBindingSummary = (taskId: string, pageId: string) => {
  const binding = readPenpotBinding(taskId, pageId);
  const target = binding ? parsePenpotBindingUrl(binding.penpotUrl) : null;
  if (!binding || !target) {
    return undefined;
  }

  return {
    fileId: target.fileId,
    penpotPageId: target.pageId,
    fileUrl: binding.penpotUrl,
    publicUrl: binding.publicUrl,
  };
};

const collectDocumentIds = (
  document: ExecutableDesignDoc,
  excludedSectionIds?: Iterable<string> | string,
) => {
  const ids = new Set<string>();
  const normalizedExcluded =
    typeof excludedSectionIds === "string" ? [excludedSectionIds] : excludedSectionIds || [];
  const excluded = new Set(normalizedExcluded);

  const visitNodes = (nodes: ExecutableDesignDoc["sections"][number]["nodes"]) => {
    for (const node of nodes) {
      ids.add(node.id);
      if (Array.isArray(node.children) && node.children.length > 0) {
        visitNodes(node.children);
      }
    }
  };

  for (const section of document.sections) {
    if (excluded.has(section.id)) {
      continue;
    }
    ids.add(section.id);
    visitNodes(section.nodes);
  }

  return ids;
};

const reflowSections = (sections: ExecutableDesignDoc["sections"]) => {
  let currentY = 0;
  return sections.map((section) => {
    const nextSection = {
      ...section,
      y: currentY,
    };
    currentY += section.height;
    return nextSection;
  });
};

const collectFinalizeErrors = (document: ExecutableDesignDoc) => {
  const errors: string[] = [];

  for (const section of document.sections) {
    if (section.nodes.length === 0) {
      errors.push(`sections.${section.id}: 区块 nodes 不能为空`);
    }
  }

  const walkNodes = (
    nodes: ExecutableDesignDoc["sections"][number]["nodes"],
    pathPrefix: string,
    collectionName: "nodes" | "children" = "nodes",
  ) => {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const nodePath = `${pathPrefix}.${collectionName}.${index}`;

      if ((node.type === "text" || node.type === "button") && typeof node.text === "string") {
        if (PLACEHOLDER_PATTERN.test(node.text)) {
          errors.push(`${nodePath}.text: 包含占位文本`);
        }
      }

      if (node.type === "image" && !node.assetUrl) {
        errors.push(`${nodePath}.assetUrl: 图片节点缺少素材地址`);
      }

      if (Array.isArray(node.children) && node.children.length > 0) {
        walkNodes(node.children, nodePath, "children");
      }
    }
  };

  for (let sectionIndex = 0; sectionIndex < document.sections.length; sectionIndex += 1) {
    walkNodes(document.sections[sectionIndex]?.nodes || [], `sections.${sectionIndex}`);
  }

  return errors;
};

const syncDesignDocWithPenpot = async (taskId: string, pageId: string) => {
  try {
    const { syncDesignDocToPenpot } = await import("./penpotSync");
    const syncResult = await syncDesignDocToPenpot(taskId, pageId);
    return {
      success: true as const,
      fileUrl: syncResult.fileUrl,
    };
  } catch (syncError) {
    return {
      success: false as const,
      error: syncError instanceof Error ? syncError.message : String(syncError),
    };
  }
};

const syncDesignDocSectionWithPenpot = async (
  taskId: string,
  pageId: string,
  sectionId: string,
) => {
  try {
    const { syncDesignDocSectionToPenpot } = await import("./penpotSync");
    const syncResult = await syncDesignDocSectionToPenpot(taskId, pageId, sectionId);
    return {
      success: true as const,
      fileUrl: syncResult.fileUrl,
    };
  } catch (syncError) {
    return {
      success: false as const,
      error: syncError instanceof Error ? syncError.message : String(syncError),
    };
  }
};

const persistValidatedDesignDoc = async ({
  ownerTaskId,
  pageId,
  title,
  existing,
  document,
}: {
  ownerTaskId: string;
  pageId: string;
  title?: string;
  existing?: StoredDesignDoc | null;
  document: ExecutableDesignDoc;
}) => {
  const now = new Date().toISOString();
  const stored: StoredDesignDoc = {
    schemaVersion: DESIGN_DOC_SCHEMA_VERSION,
    pageId,
    title: title?.trim() || existing?.title || document.page.name,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    document,
  };

  writeStoredDesignDoc(ownerTaskId, pageId, stored);
  const penpotSync = await syncDesignDocWithPenpot(ownerTaskId, pageId);
  return { stored, penpotSync };
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
        penpotBinding: getPenpotBindingSummary(
          taskId,
          stored?.pageId || name.replace(/\.json$/i, ""),
        ),
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
    penpotBinding: getPenpotBindingSummary(taskId, normalizedPageId),
  };
};

const resolveDesignDocMutationContext = ({
  taskId,
  parentId,
  pageId,
}: {
  taskId?: string;
  parentId?: string;
  pageId: unknown;
}) => {
  const ownerTaskId = resolveDesignDocOwnerTaskId(taskId, parentId);
  if (!ownerTaskId) {
    return {
      ok: false as const,
      message: "taskId 不能为空",
    };
  }

  const normalizedPageId = normalizePageId(String(pageId || ""));
  if (!normalizedPageId) {
    return {
      ok: false as const,
      message: "pageId 不能为空，且只能包含可归一化的页面标识",
    };
  }

  const docsPath = getDesignDocsPath(ownerTaskId);
  const filePath = path.join(docsPath, `${normalizedPageId}.json`);

  return {
    ok: true as const,
    ownerTaskId,
    normalizedPageId,
    docsPath,
    filePath,
    existing: loadStoredDesignDoc(filePath),
  };
};

export const createDesignDocFromMarkupTool = defineTool({
  name: "createDesignDocFromMarkup",
  description:
    "使用受限的 HTML + inline CSS 生成或扩展页面设计稿；传 update=true 时按 section.id 对已有页面做局部更新。这个工具的 <page> 根节点只是当前这一步 section 集合的容器，不等于必须一次提交完整页。",
  whenToUse:
    "当需要创建、扩展、整体重建，或按区块局部更新页面设计稿时使用。复杂页面首次创建时，默认先只提交 1 个 section 或一组强耦合 section，不要一开始就整页提交。先调用 listDesignAssets 查看当前已存储资产，再生成 markup；生成时只能复用这些已有资产。",
  params: [
    {
      name: "pageId",
      optional: false,
      description: "页面或视图标识，推荐 kebab-case，例如 home-page、blog-detail",
    },
    {
      name: "title",
      optional: true,
      description: "设计稿标题，便于后续检索；默认使用 <page name> 或 <page title>",
    },
    {
      name: "markupText",
      optional: false,
      description:
        '受限 HTML/CSS 字符串。根节点必须是 <page>；<page> 的直接子节点必须是 <section>，并且每个 <section> 都要显式写 id、name、kind。<section> 只能作为 <page> 的直接子节点；左右分栏、卡片网格、侧边栏与主内容并排等布局，请在某个顶层 section 内用 div + flex / grid 表达，不要使用 float、fixed、sticky。禁止使用 emoji。不要使用 SVG；图标、插画和品牌图形只能通过 <use component="asset-id" id="instance-id" /> 或 <img asset="asset-id" /> 复用 listDesignAssets 已返回的已存储设计资产，不要在本次生成里临时创建新资产或内联补资产。复杂页面首次创建时，默认先只提交 1 个 section 或一组强耦合 section；如果这一步已经把多个 section 放进 page，那么这些 section 都必须细化完成，不能只停在骨架或 outline。创建页面时必须显式写 <page width="...">，并让宽度匹配目标端；移动端页面不要沿用 1440。设计稿尺寸必须受控：page.width 需在 240-2560 之间，page.minHeight 需在 200-20000 之间，section 和 node 的宽高也必须保持在合理范围内。支持 <page>、<section>、<div>、<text>、<button>、<img>、<shape>、<use>、<br>、<input>、<textarea> 及常见语义文本标签；支持的样式范围以工具白名单为准。不要使用 class、外部样式表、脚本或任意定位语法。转义后的 &lt;page&gt; / &lt;section&gt; 会被直接拒绝。',
    },
    {
      name: "update",
      optional: true,
      description:
        "是否按 section.id 对已有页面做局部更新。为 true 时，markupText 仍然必须是 <page> 根节点，但只需要包含要替换的部分 <section>；系统会保留未提供的其他 section。",
    },
  ],
  async invoke({ params, context }) {
    const resolved = resolveDesignDocMutationContext({
      taskId: context.taskId,
      parentId: context.parentId,
      pageId: params.pageId,
    });

    if (!resolved.ok) {
      return {
        message: resolved.message,
        toolResult: {
          success: false,
          pageId: "",
          validationErrors: [resolved.message],
          message: resolved.message,
        },
      };
    }

    if (typeof params.markupText !== "string" || !params.markupText.trim()) {
      const message = "markupText 必须是非空字符串";
      return {
        message,
        toolResult: {
          success: false,
          pageId: resolved.normalizedPageId,
          validationErrors: [message],
          message,
        },
      };
    }

    try {
      const assets = listAvailableDesignAssets(resolved.ownerTaskId);
      const components = assets
        .filter((asset) => asset.type === "component")
        .map((asset) => ({ id: asset.id, markupText: asset.markupText }));
      const images = assets
        .filter((asset) => asset.type === "image")
        .map((asset) => ({
          id: asset.id,
          url: asset.url,
          width: asset.width,
          height: asset.height,
        }));
      const updateMode = params.update === true;

      if (updateMode) {
        const existing = readStoredDesignDoc(resolved.ownerTaskId, resolved.normalizedPageId);
        if (!existing || !existing.validation.valid || !existing.validation.document) {
          const message = `未找到页面 ${resolved.normalizedPageId} 的有效设计稿，无法执行 update`;
          return {
            message,
            toolResult: {
              success: false,
              pageId: resolved.normalizedPageId,
              validationErrors: [message],
              message,
            },
          };
        }

        const initialPartial = compileDesignDocSectionsFromMarkup({
          markupText: params.markupText,
          pageWidth: existing.validation.document.page.width,
          components,
          images,
        });

        if (!initialPartial.sections || !initialPartial.root) {
          const validationErrors =
            initialPartial.errors.length > 0 ? initialPartial.errors : ["设计稿标记编译失败"];
          const message = validationErrors[0] || "设计稿标记编译失败";
          return {
            message,
            toolResult: {
              success: false,
              pageId: resolved.normalizedPageId,
              validationErrors,
              message,
            },
          };
        }

        const sectionIds = initialPartial.sections.map((section) => section.id);
        const missingSectionIds = sectionIds.filter(
          (sectionId) =>
            !existing.validation.document.sections.some((section) => section.id === sectionId),
        );
        if (missingSectionIds.length > 0) {
          const message = `update 模式只能替换已有区块，未找到: ${missingSectionIds.join(", ")}`;
          return {
            message,
            toolResult: {
              success: false,
              pageId: resolved.normalizedPageId,
              validationErrors: [message],
              message,
            },
          };
        }

        const partial = compileDesignDocSectionsFromMarkup({
          markupText: params.markupText,
          pageWidth: existing.validation.document.page.width,
          reservedIds: collectDocumentIds(existing.validation.document, sectionIds),
          components,
          images,
        });

        if (!partial.sections || !partial.root) {
          const validationErrors =
            partial.errors.length > 0 ? partial.errors : ["设计稿标记编译失败"];
          const message = validationErrors[0] || "设计稿标记编译失败";
          return {
            message,
            toolResult: {
              success: false,
              pageId: resolved.normalizedPageId,
              validationErrors,
              message,
            },
          };
        }

        const mergedSections = existing.validation.document.sections.map((section) => {
          const replacement = partial.sections?.find((candidate) => candidate.id === section.id);
          return replacement || section;
        });
        const reflowedSections = reflowSections(mergedSections);
        const totalHeight = reflowedSections.reduce((sum, section) => sum + section.height, 0);
        const nextDocument: ExecutableDesignDoc = {
          ...existing.validation.document,
          page: {
            ...existing.validation.document.page,
            ...(partial.root.attributes.name ? { name: partial.root.attributes.name } : {}),
            ...(partial.root.attributes.path ? { path: partial.root.attributes.path } : {}),
            minHeight: Math.max(existing.validation.document.page.minHeight, totalHeight),
          },
          sections: reflowedSections,
        };

        const validation = validateExecutableDesignDoc(nextDocument);
        if (!validation.valid || !validation.document) {
          const message = `设计稿未通过 v3 schema 校验，共 ${validation.errors.length} 个错误`;
          return {
            message,
            toolResult: {
              success: false,
              pageId: resolved.normalizedPageId,
              validationErrors: validation.errors,
              message,
            },
          };
        }

        const finalizeErrors = collectFinalizeErrors(validation.document);
        if (finalizeErrors.length > 0) {
          const message = `设计稿尚未完成，共发现 ${finalizeErrors.length} 个问题`;
          return {
            message,
            toolResult: {
              success: false,
              pageId: resolved.normalizedPageId,
              validationErrors: finalizeErrors,
              message,
            },
          };
        }

        const { stored, penpotSync } = await persistValidatedDesignDoc({
          ownerTaskId: resolved.ownerTaskId,
          pageId: resolved.normalizedPageId,
          title: typeof params.title === "string" ? params.title : undefined,
          existing: resolved.existing,
          document: validation.document,
        });

        const inlineComponents = extractInlineComponentDefinitionsFromMarkup(params.markupText);
        if (inlineComponents.errors.length === 0) {
          for (const component of inlineComponents.components) {
            upsertStoredDesignComponent(resolved.ownerTaskId, {
              id: component.id,
              markupText: component.markupText,
            });
          }
        }

        const updatedSectionIds = Array.from(sectionIds);
        const message =
          penpotSync.success === false
            ? `设计稿已局部更新: ${updatedSectionIds.join(", ")}，但同步到 Penpot 失败`
            : `设计稿已局部更新并同步到 Penpot: ${updatedSectionIds.join(", ")}`;

        return {
          message,
          toolResult: {
            success: true,
            pageId: resolved.normalizedPageId,
            title: stored.title,
            updatedAt: stored.updatedAt,
            summary: getStoredDocumentSummary(stored.document),
            penpotSync,
            validationErrors: [],
            message,
          },
        };
      }

      const compiled = compileDesignDocFromMarkup(params.markupText, {
        components,
        images,
      });
      if (!compiled.document) {
        const validationErrors =
          compiled.errors.length > 0 ? compiled.errors : ["设计稿标记编译失败"];
        const message = validationErrors[0] || "设计稿标记编译失败";
        return {
          message,
          toolResult: {
            success: false,
            pageId: resolved.normalizedPageId,
            validationErrors,
            message,
          },
        };
      }

      const validation = validateExecutableDesignDoc(compiled.document);
      if (!validation.valid || !validation.document) {
        const message = `设计稿未通过 v3 schema 校验，共 ${validation.errors.length} 个错误`;
        return {
          message,
          toolResult: {
            success: false,
            pageId: resolved.normalizedPageId,
            validationErrors: validation.errors,
            message,
          },
        };
      }

      const finalizeErrors = collectFinalizeErrors(validation.document);
      if (finalizeErrors.length > 0) {
        const message = `设计稿尚未完成，共发现 ${finalizeErrors.length} 个问题`;
        return {
          message,
          toolResult: {
            success: false,
            pageId: resolved.normalizedPageId,
            validationErrors: finalizeErrors,
            message,
          },
        };
      }

      const { stored, penpotSync } = await persistValidatedDesignDoc({
        ownerTaskId: resolved.ownerTaskId,
        pageId: resolved.normalizedPageId,
        title: typeof params.title === "string" ? params.title : undefined,
        existing: resolved.existing,
        document: validation.document,
      });

      const inlineComponents = extractInlineComponentDefinitionsFromMarkup(params.markupText);
      if (inlineComponents.errors.length === 0) {
        for (const component of inlineComponents.components) {
          upsertStoredDesignComponent(resolved.ownerTaskId, {
            id: component.id,
            markupText: component.markupText,
          });
        }
      }

      const message =
        penpotSync.success === false
          ? `设计稿已生成: ${resolved.normalizedPageId}，但同步到 Penpot 失败`
          : `设计稿已生成并同步到 Penpot: ${resolved.normalizedPageId}`;

      return {
        message,
        toolResult: {
          success: true,
          pageId: resolved.normalizedPageId,
          title: stored.title,
          updatedAt: stored.updatedAt,
          summary: getStoredDocumentSummary(stored.document),
          penpotSync,
          validationErrors: [],
          message,
        },
      };
    } catch (error) {
      const message = `生成设计稿失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error("[DesignDocs] createDesignDocFromMarkup error:", error);
      return {
        message,
        toolResult: {
          success: false,
          pageId: resolved.normalizedPageId,
          validationErrors: [message],
          message,
        },
      };
    }
  },
});

export const replaceDesignSectionFromMarkupTool = defineTool({
  name: "replaceDesignSectionFromMarkup",
  description:
    "用受限的 <section> HTML + inline CSS 替换现有设计稿中的单个区块，并仅同步受影响的区块到 Penpot。调用前先用 listDesignAssets 查看当前可复用的已存储设计资产；生成时只能引用这些已有资产。",
  whenToUse:
    "当页面已存在设计稿，只需要修改某个 section，而不是整体重建页面时使用。先调用 listDesignAssets 查看当前已存储资产，再生成 markup；生成时只能复用这些已有资产。markupText 根节点必须是 <section>。",
  params: [
    {
      name: "pageId",
      optional: false,
      description: "页面或视图标识，推荐 kebab-case，例如 home-page、blog-detail",
    },
    {
      name: "sectionId",
      optional: false,
      description: "要替换的区块 id，必须和现有设计稿中的 section.id 一致",
    },
    {
      name: "markupText",
      optional: false,
      description:
        '受限 HTML/CSS 字符串，根节点必须是 <section>。调用本工具前先用 listDesignAssets 查看当前已存储设计资产，再决定具体引用方式。必须显式写 section 的 id、name、kind，且 name 必须是简短的人类可读区块名。禁止使用 emoji。支持的标签和样式范围与 createDesignDocFromMarkup 一致；复用设计组件时请写 <use component="asset-id" id="instance-id" />，复用图片资产时请写 <img asset="asset-id" ... />，且只能引用 listDesignAssets 已返回的已存储资产。支持 margin/margin-top/margin-right/margin-bottom/margin-left 和 margin:auto，<br> 可用于文本换行，display:grid + grid-template-columns 可用于等列网格；当前是静态设计稿，不需要动效或复杂交互；hover-/focus-/active- 前缀属性会被透传为元数据，但不参与布局和渲染。转义后的 &lt;section&gt; 会被直接拒绝。',
    },
  ],
  async invoke({ params, context }) {
    const resolved = resolveDesignDocMutationContext({
      taskId: context.taskId,
      parentId: context.parentId,
      pageId: params.pageId,
    });

    if (!resolved.ok) {
      return {
        message: resolved.message,
        toolResult: {
          success: false,
          pageId: "",
          validationErrors: [resolved.message],
          message: resolved.message,
        },
      };
    }

    const targetSectionId = typeof params.sectionId === "string" ? params.sectionId.trim() : "";
    if (!targetSectionId) {
      const message = "sectionId 不能为空";
      return {
        message,
        toolResult: {
          success: false,
          pageId: resolved.normalizedPageId,
          validationErrors: [message],
          message,
        },
      };
    }

    if (typeof params.markupText !== "string" || !params.markupText.trim()) {
      const message = "markupText 必须是非空字符串";
      return {
        message,
        toolResult: {
          success: false,
          pageId: resolved.normalizedPageId,
          validationErrors: [message],
          message,
        },
      };
    }

    try {
      const existing = readStoredDesignDoc(resolved.ownerTaskId, resolved.normalizedPageId);
      if (!existing || !existing.validation.valid || !existing.validation.document) {
        const message = `未找到页面 ${resolved.normalizedPageId} 的有效设计稿`;
        return {
          message,
          toolResult: {
            success: false,
            pageId: resolved.normalizedPageId,
            validationErrors: [message],
            message,
          },
        };
      }

      const currentDocument = existing.validation.document;
      const targetIndex = currentDocument.sections.findIndex(
        (section) => section.id === targetSectionId,
      );
      if (targetIndex === -1) {
        const message = `未找到区块 ${targetSectionId}`;
        return {
          message,
          toolResult: {
            success: false,
            pageId: resolved.normalizedPageId,
            validationErrors: [
              message,
              `可用区块: ${currentDocument.sections.map((section) => section.id).join(", ")}`,
            ],
            message,
          },
        };
      }

      const assets = listAvailableDesignAssets(resolved.ownerTaskId);
      const compiled = compileDesignSectionFromMarkup({
        markupText: params.markupText,
        pageWidth: currentDocument.page.width,
        startY: currentDocument.sections[targetIndex]?.y || 0,
        reservedIds: collectDocumentIds(currentDocument, targetSectionId),
        components: assets
          .filter((asset) => asset.type === "component")
          .map((asset) => ({ id: asset.id, markupText: asset.markupText })),
        images: assets
          .filter((asset) => asset.type === "image")
          .map((asset) => ({
            id: asset.id,
            url: asset.url,
            width: asset.width,
            height: asset.height,
          })),
      });

      if (!compiled.section) {
        const validationErrors =
          compiled.errors.length > 0 ? compiled.errors : ["设计稿区块标记编译失败"];
        const message = validationErrors[0] || "设计稿区块标记编译失败";
        return {
          message,
          toolResult: {
            success: false,
            pageId: resolved.normalizedPageId,
            validationErrors,
            message,
          },
        };
      }

      const compiledSection = compiled.section;
      const nextSections = currentDocument.sections.map((section, index) =>
        index === targetIndex ? compiledSection : section,
      );
      const reflowedSections = reflowSections(nextSections);
      const totalHeight = reflowedSections.reduce((sum, section) => sum + section.height, 0);
      const nextDocument: ExecutableDesignDoc = {
        ...currentDocument,
        page: {
          ...currentDocument.page,
          minHeight: Math.max(currentDocument.page.minHeight, totalHeight),
        },
        sections: reflowedSections,
      };

      const validation = validateExecutableDesignDoc(nextDocument);
      if (!validation.valid || !validation.document) {
        const message = `设计稿未通过 v3 schema 校验，共 ${validation.errors.length} 个错误`;
        return {
          message,
          toolResult: {
            success: false,
            pageId: resolved.normalizedPageId,
            validationErrors: validation.errors,
            message,
          },
        };
      }

      const finalizeErrors = collectFinalizeErrors(validation.document);
      if (finalizeErrors.length > 0) {
        const message = `设计稿尚未完成，共发现 ${finalizeErrors.length} 个问题`;
        return {
          message,
          toolResult: {
            success: false,
            pageId: resolved.normalizedPageId,
            validationErrors: finalizeErrors,
            message,
          },
        };
      }

      const now = new Date().toISOString();
      const stored: StoredDesignDoc = {
        schemaVersion: existing.stored.schemaVersion,
        pageId: resolved.normalizedPageId,
        title: existing.stored.title || validation.document.page.name,
        createdAt: existing.stored.createdAt,
        updatedAt: now,
        document: validation.document,
      };

      writeStoredDesignDoc(resolved.ownerTaskId, resolved.normalizedPageId, stored);
      const affectedSectionIds = validation.document.sections
        .slice(targetIndex)
        .map((section) => section.id);
      const penpotSync = await syncDesignDocSectionWithPenpot(
        resolved.ownerTaskId,
        resolved.normalizedPageId,
        affectedSectionIds[0] || targetSectionId,
      );

      const message =
        penpotSync.success === false
          ? `设计稿区块已更新: ${targetSectionId}，但同步到 Penpot 失败`
          : `设计稿区块已更新并同步到 Penpot: ${targetSectionId}`;

      return {
        message,
        toolResult: {
          success: true,
          pageId: resolved.normalizedPageId,
          title: stored.title,
          updatedAt: stored.updatedAt,
          summary: getStoredDocumentSummary(stored.document),
          penpotSync,
          validationErrors: [],
          message,
        },
      };
    } catch (error) {
      const message = `更新设计稿区块失败: ${error instanceof Error ? error.message : String(error)}`;
      logger.error("[DesignDocs] replaceDesignSectionFromMarkup error:", error);
      return {
        message,
        toolResult: {
          success: false,
          pageId: resolved.normalizedPageId,
          validationErrors: [message],
          message,
        },
      };
    }
  },
});

export const listDesignDocsTool = defineTool({
  name: "listDesignDocs",
  description: "列出当前任务下已有的设计稿页面，便于选择后续要读取或复用的页面。",
  whenToUse: "在读取具体设计稿前，先查看当前任务下有多少设计稿、分别对应哪些页面时使用。",
  params: [],
  async invoke({ context }) {
    const ownerTaskId = resolveDesignDocOwnerTaskId(context.taskId, context.parentId);
    if (!ownerTaskId) {
      const message = "taskId 不能为空";
      return {
        message,
        toolResult: {
          success: false,
          availableDocs: [],
          validationErrors: ["taskId 不能为空"],
          message,
        },
      };
    }

    const availableDocs = listStoredDesignDocs(ownerTaskId);
    const message =
      availableDocs.length === 0
        ? "当前任务还没有任何设计稿"
        : `当前任务共有 ${availableDocs.length} 份设计稿`;

    return {
      message,
      toolResult: {
        success: availableDocs.length > 0,
        availableDocs,
        validationErrors: [],
        message,
      },
    };
  },
});

export const readDesignDocTool = defineTool({
  name: "readDesignDoc",
  description: "读取当前任务中指定页面的设计稿 JSON。调用前应先通过 listDesignDocs 确认可用页面。",
  whenToUse: "在编写或修改 UI 代码前读取某一份具体设计稿时使用；必须显式提供 pageId。",
  params: [
    {
      name: "pageId",
      optional: false,
      description: "要读取的页面标识，必须来自 listDesignDocs 返回的 availableDocs.pageId",
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
          pageId: String(params.pageId || ""),
          content: "",
          validationErrors: ["taskId 不能为空"],
          message,
        },
      };
    }

    const pageId = typeof params.pageId === "string" ? normalizePageId(params.pageId) : "";
    if (!pageId) {
      const message = "pageId 不能为空，且必须先通过 listDesignDocs 选择具体页面";
      return {
        message,
        toolResult: {
          success: false,
          pageId: "",
          content: "",
          validationErrors: [message],
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
          pageId,
          content: "",
          validationErrors: [],
          message,
        },
      };
    }

    try {
      const readResult = readStoredDesignDoc(ownerTaskId, pageId);
      if (!readResult) {
        const message = `未找到页面 ${pageId} 的设计稿`;
        return {
          message,
          toolResult: {
            success: false,
            pageId,
            content: "",
            penpotBinding: undefined,
            validationErrors: [message],
            message,
          },
        };
      }

      const content = readResult.validation.document
        ? serializeDesignDocToMarkup(readResult.validation.document)
        : "";
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
          penpotBinding: readResult.penpotBinding,
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
          penpotBinding: undefined,
          validationErrors: [message],
          message,
        },
      };
    }
  },
});

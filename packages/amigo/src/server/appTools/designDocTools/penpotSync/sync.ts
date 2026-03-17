import { randomUUID } from "node:crypto";
import { logger } from "@amigo-llm/backend";
import {
  readStoredDesignAssets,
  type StoredDesignAsset,
  type StoredDesignComponentAsset,
  type StoredDesignImageAsset,
} from "../designAssets";
import { type ExecutableDesignDoc, validateExecutableDesignDoc } from "../designDocSchema";
import { readStoredDesignDoc, writeStoredDesignDoc } from "../designDocs";
import { compileDesignDocFromMarkup } from "../designMarkupCompiler";
import {
  listPenpotBindings,
  type PenpotComponentBinding,
  type PenpotComponentMap,
  type PenpotMediaObjectBinding,
  parsePenpotBindingUrl,
  readPenpotBinding,
  writePenpotBinding,
} from "../penpotBindings";
import {
  buildWorkspaceUrl,
  callPenpotRpc,
  ensurePenpotReadAccess,
  ensurePenpotWriteAccess,
  readPenpotSyncConfig,
} from "./config";
import {
  buildCreatePageChanges,
  buildReplacePageChanges,
  buildReplaceSectionChanges,
} from "./exportBuilders";
import { convertPenpotFileToDesignDoc } from "./importTransform";
import { createStablePenpotUuid } from "./shared";
import type {
  PenpotMediaObject,
  PenpotRemoteState,
  PenpotRpcFile,
  PenpotSyncResult,
} from "./types";

const PENPOT_COMPONENT_ASSETS_PAGE_NAME = "Amigo Assets · Components";
const PENPOT_IMAGE_ASSETS_PAGE_NAME = "Amigo Assets · Images";
const PENPOT_ASSET_PAGE_WIDTH = 1200;

const isValidHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const toMediaCompatibleImageUrl = (value: string) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host !== "via.placeholder.com" && host !== "placeholder.com") {
      return value;
    }

    const path = url.pathname.replace(/^\/+/, "");
    const match = path.match(/^(\d+)(?:x(\d+))?/i);
    const width = Number(match?.[1] || 0) || 160;
    const height = Number(match?.[2] || match?.[1] || 0) || width;
    const seed = `${host}-${width}x${height}`;
    return `https://picsum.photos/seed/${seed}/${width}/${height}`;
  } catch {
    return value;
  }
};

type ImageAssetUrlNode = {
  type: string;
  assetUrl?: string;
  children?: ImageAssetUrlNode[];
  style?: unknown;
};

const collectImageAssetUrlsFromNodes = (nodes: ImageAssetUrlNode[], urls = new Set<string>()) => {
  for (const node of nodes) {
    if (
      node.type === "image" &&
      typeof node.assetUrl === "string" &&
      isValidHttpUrl(node.assetUrl)
    ) {
      urls.add(node.assetUrl);
    }

    const style = node.style;
    if (style && typeof style === "object") {
      const fill = (style as { fill?: unknown }).fill;
      if (
        fill &&
        typeof fill === "object" &&
        !Array.isArray(fill) &&
        (fill as { type?: unknown }).type === "image" &&
        typeof (fill as { assetUrl?: unknown }).assetUrl === "string" &&
        isValidHttpUrl((fill as { assetUrl: string }).assetUrl)
      ) {
        urls.add((fill as { assetUrl: string }).assetUrl);
      }

      const fills = (style as { fills?: unknown }).fills;
      if (Array.isArray(fills)) {
        for (const item of fills) {
          if (
            item &&
            typeof item === "object" &&
            !Array.isArray(item) &&
            (item as { type?: unknown }).type === "image" &&
            typeof (item as { assetUrl?: unknown }).assetUrl === "string" &&
            isValidHttpUrl((item as { assetUrl: string }).assetUrl)
          ) {
            urls.add((item as { assetUrl: string }).assetUrl);
          }
        }
      }
    }

    if (Array.isArray(node.children) && node.children.length > 0) {
      collectImageAssetUrlsFromNodes(node.children, urls);
    }
  }

  return urls;
};

const collectImageAssetUrls = (document: ExecutableDesignDoc) => {
  const urls = new Set<string>();
  for (const section of document.sections) {
    collectImageAssetUrlsFromNodes(section.nodes as ImageAssetUrlNode[], urls);
  }
  return [...urls];
};

const toPenpotMediaObject = (binding: PenpotMediaObjectBinding): PenpotMediaObject | null => {
  if (
    !binding.id ||
    typeof binding.width !== "number" ||
    typeof binding.height !== "number" ||
    typeof binding.mtype !== "string"
  ) {
    return null;
  }

  return {
    id: binding.id,
    width: binding.width,
    height: binding.height,
    mtype: binding.mtype,
    mediaId: binding.mediaId,
    thumbnailId: binding.thumbnailId,
    name: binding.name,
    isLocal: binding.isLocal,
    createdAt: binding.createdAt,
  };
};

const ensurePenpotMediaObjects = async (
  config: ReturnType<typeof readPenpotSyncConfig>,
  fileId: string,
  assetUrls: string[],
  existingMap?: Record<string, PenpotMediaObjectBinding>,
) => {
  const mediaObjectsByAssetUrl: Record<string, PenpotMediaObject> = {};
  const mediaBindings: Record<string, PenpotMediaObjectBinding> = {
    ...(existingMap || {}),
  };

  for (const assetUrl of assetUrls) {
    const existing = existingMap?.[assetUrl];
    const existingMedia = existing ? toPenpotMediaObject(existing) : null;
    if (existingMedia) {
      mediaObjectsByAssetUrl[assetUrl] = existingMedia;
      continue;
    }

    const mediaCompatibleUrl = toMediaCompatibleImageUrl(assetUrl);
    const fileMedia = await callPenpotRpc<PenpotMediaObject>(
      config,
      "create-file-media-object-from-url",
      {
        "file-id": fileId,
        "is-local": true,
        name: mediaCompatibleUrl.split("/").pop() || "image",
        url: mediaCompatibleUrl,
      },
    );
    mediaObjectsByAssetUrl[assetUrl] = fileMedia;
    mediaBindings[assetUrl] = {
      id: fileMedia.id,
      mediaId: fileMedia.mediaId,
      thumbnailId: fileMedia.thumbnailId,
      name: fileMedia.name,
      width: fileMedia.width,
      height: fileMedia.height,
      mtype: fileMedia.mtype,
      isLocal: fileMedia.isLocal,
      createdAt: fileMedia.createdAt,
    };
  }

  return {
    mediaObjectsByAssetUrl,
    mediaBindings,
  };
};

const countNodes = (
  nodes: Array<{ type: string; children?: Array<{ type: string; children?: unknown[] }> }>,
) => {
  let total = 0;
  const byType: Record<string, number> = {};

  const visit = (
    entries: Array<{ type: string; children?: Array<{ type: string; children?: unknown[] }> }>,
  ) => {
    for (const node of entries) {
      total += 1;
      byType[node.type] = (byType[node.type] || 0) + 1;
      if (Array.isArray(node.children) && node.children.length > 0) {
        visit(node.children);
      }
    }
  };

  visit(nodes);
  return { total, byType };
};

const summarizeDesignDocForSync = (document: ExecutableDesignDoc) => {
  const sections = document.sections.map((section) => {
    const nodeSummary = countNodes(section.nodes);
    return {
      id: section.id,
      name: section.name,
      kind: section.kind,
      y: section.y,
      height: section.height,
      nodeCount: nodeSummary.total,
      nodeTypes: nodeSummary.byType,
    };
  });

  return {
    page: {
      name: document.page.name,
      width: document.page.width,
      minHeight: document.page.minHeight,
      background: document.page.background,
    },
    sectionCount: sections.length,
    sections,
  };
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const toAssetSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";

const findPageIdByName = (file: PenpotRpcFile, pageName: string) => {
  const pagesIndex = file.data?.pagesIndex || {};
  for (const [pageId, page] of Object.entries(pagesIndex)) {
    if (page?.name === pageName) {
      return pageId;
    }
  }
  return null;
};

const buildComponentAssetsPageMarkup = (assets: StoredDesignComponentAsset[]) => {
  const sections = assets.map((asset, index) => {
    const slug = toAssetSlug(asset.id);
    return `
      <section id="component-asset-${slug}" name="${escapeHtml(asset.name || asset.id)}" kind="asset" style="padding:32px;display:flex;flex-direction:column;gap:16px;background:${index % 2 === 0 ? "#F8FAFC" : "#FFFFFF"};border-bottom:1px solid #E5E7EB">
        <text id="component-asset-${slug}-title" style="font-size:24px;font-weight:700;color:#111827">${escapeHtml(asset.name || asset.id)}</text>
        <text id="component-asset-${slug}-meta" style="font-size:14px;color:#6B7280">${escapeHtml(asset.id)}</text>
        <div id="component-asset-${slug}-preview" style="display:flex;justify-content:flex-start;align-items:flex-start;padding:16px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:16px">
          <use component="${escapeHtml(asset.id)}" id="component-asset-${slug}-instance" />
        </div>
      </section>
    `.trim();
  });

  return `
    <page name="${escapeHtml(PENPOT_COMPONENT_ASSETS_PAGE_NAME)}" width="${PENPOT_ASSET_PAGE_WIDTH}" style="background:#F3F4F6">
      ${sections.join("\n")}
    </page>
  `.trim();
};

const buildImageAssetsPageMarkup = (assets: StoredDesignImageAsset[]) => {
  const sections = assets.map((asset, index) => {
    const slug = toAssetSlug(asset.id);
    const previewWidth = Math.max(160, Math.min(480, asset.width || 320));
    const previewHeight = Math.max(120, Math.min(320, asset.height || 200));
    return `
      <section id="image-asset-${slug}" name="${escapeHtml(asset.name || asset.id)}" kind="asset" style="padding:32px;display:flex;flex-direction:column;gap:16px;background:${index % 2 === 0 ? "#F8FAFC" : "#FFFFFF"};border-bottom:1px solid #E5E7EB">
        <text id="image-asset-${slug}-title" style="font-size:24px;font-weight:700;color:#111827">${escapeHtml(asset.name || asset.id)}</text>
        <text id="image-asset-${slug}-meta" style="font-size:14px;color:#6B7280">${escapeHtml(asset.id)}</text>
        <img id="image-asset-${slug}-preview" asset="${escapeHtml(asset.id)}" width="${previewWidth}" height="${previewHeight}" style="border-radius:16px;border:1px solid #CBD5E1" />
      </section>
    `.trim();
  });

  return `
    <page name="${escapeHtml(PENPOT_IMAGE_ASSETS_PAGE_NAME)}" width="${PENPOT_ASSET_PAGE_WIDTH}" style="background:#F3F4F6">
      ${sections.join("\n")}
    </page>
  `.trim();
};

const compileAssetPageDocument = (
  assetPageName: string,
  markupText: string,
  assets: StoredDesignAsset[],
) => {
  const compiled = compileDesignDocFromMarkup(markupText, {
    components: assets
      .filter((asset): asset is StoredDesignComponentAsset => asset.type === "component")
      .map((asset) => ({ id: asset.id, markupText: asset.markupText })),
    images: assets
      .filter((asset): asset is StoredDesignImageAsset => asset.type === "image")
      .map((asset) => ({
        id: asset.id,
        url: asset.url,
        width: asset.width,
        height: asset.height,
      })),
  });

  if (!compiled.document) {
    throw new Error(`资产页 ${assetPageName} 编译失败: ${compiled.errors[0] || "未知错误"}`);
  }

  const validation = validateExecutableDesignDoc(compiled.document);
  if (!validation.valid || !validation.document) {
    throw new Error(
      `资产页 ${assetPageName} 未通过 schema 校验: ${validation.errors[0] || "未知错误"}`,
    );
  }

  return validation.document;
};

const getComponentAssetSectionId = (assetId: string) => `component-asset-${toAssetSlug(assetId)}`;
const getComponentAssetPreviewNodeId = (assetId: string) =>
  `${getComponentAssetSectionId(assetId)}-preview`;
const getComponentAssetInstanceNodeId = (assetId: string) =>
  `${getComponentAssetSectionId(assetId)}-instance`;

const splitComponentAssetPath = (assetId: string) => {
  const parts = assetId.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return {
      path: "",
      name: parts[0] || assetId,
    };
  }

  return {
    path: parts.slice(0, -1).join("/"),
    name: parts[parts.length - 1] || assetId,
  };
};

interface PenpotAssetSyncPlan {
  pageChanges: Record<string, unknown>[];
  componentBindings: PenpotComponentMap;
  imageAssetUrls: string[];
}

const buildAssetSyncPlan = (
  taskId: string,
  file: PenpotRpcFile,
  fileId: string,
  mediaObjectsByAssetUrl: Record<string, PenpotMediaObject>,
  existingComponentBindings?: PenpotComponentMap,
) => {
  const assets = readStoredDesignAssets(taskId);
  if (assets.length === 0) {
    return {
      pageChanges: [] as Record<string, unknown>[],
      componentBindings: {} as PenpotComponentMap,
      imageAssetUrls: [] as string[],
    } satisfies PenpotAssetSyncPlan;
  }

  const componentAssets = assets.filter(
    (asset): asset is StoredDesignComponentAsset => asset.type === "component",
  );
  const imageAssets = assets.filter(
    (asset): asset is StoredDesignImageAsset => asset.type === "image",
  );

  const pageChanges: Record<string, unknown>[] = [];
  const componentBindings: PenpotComponentMap = {};
  const imageAssetUrls = new Set<string>();
  const existingComponentIds = new Set(Object.keys(file.data?.components || {}));

  if (componentAssets.length > 0) {
    const pageId =
      findPageIdByName(file, PENPOT_COMPONENT_ASSETS_PAGE_NAME) ||
      createStablePenpotUuid("penpot-assets-page:components");
    const document = compileAssetPageDocument(
      PENPOT_COMPONENT_ASSETS_PAGE_NAME,
      buildComponentAssetsPageMarkup(componentAssets),
      assets,
    );
    for (const url of collectImageAssetUrls(document)) {
      imageAssetUrls.add(url);
    }
    const replacement = findPageIdByName(file, PENPOT_COMPONENT_ASSETS_PAGE_NAME)
      ? buildReplacePageChanges(file, document, pageId, mediaObjectsByAssetUrl)
      : buildCreatePageChanges(document, pageId, mediaObjectsByAssetUrl);
    pageChanges.push(...replacement.changes);

    for (const asset of componentAssets) {
      const sectionId = getComponentAssetSectionId(asset.id);
      const previewNodeId = getComponentAssetPreviewNodeId(asset.id);
      const instanceNodeId = getComponentAssetInstanceNodeId(asset.id);
      const sourceParentSeed = `section:${sectionId}/${previewNodeId}`;
      const componentId = createStablePenpotUuid(`penpot-component:${asset.id}`);
      const { path, name } = splitComponentAssetPath(asset.id);
      const binding: PenpotComponentBinding = {
        componentId,
        fileId,
        pageId,
        mainInstanceId: createStablePenpotUuid(`${sourceParentSeed}/${instanceNodeId}`),
        sourceParentSeed,
        sourceInstanceNodeId: instanceNodeId,
        name: asset.name || name,
        path,
      };
      componentBindings[asset.id] = binding;

      if (existingComponentIds.has(componentId)) {
        pageChanges.push({
          type: "mod-component",
          id: componentId,
          name: binding.name || name,
          path,
        });
        continue;
      }

      const existingBinding = existingComponentBindings?.[asset.id];
      pageChanges.push({
        type: existingBinding?.componentId === componentId ? "mod-component" : "add-component",
        id: componentId,
        name: binding.name || name,
        path,
        ...(existingBinding?.componentId === componentId
          ? {}
          : {
              "main-instance-id": binding.mainInstanceId,
              "main-instance-page": pageId,
            }),
      });
    }

    const staleAssetIds = Object.keys(existingComponentBindings || {}).filter(
      (assetId) => !componentBindings[assetId],
    );
    for (const assetId of staleAssetIds) {
      const staleBinding = existingComponentBindings?.[assetId];
      if (staleBinding?.componentId) {
        pageChanges.unshift({
          type: "del-component",
          id: staleBinding.componentId,
        });
      }
    }
  }

  if (imageAssets.length > 0) {
    for (const asset of imageAssets) {
      if (isValidHttpUrl(asset.url)) {
        imageAssetUrls.add(asset.url);
      }
    }
    const pageId =
      findPageIdByName(file, PENPOT_IMAGE_ASSETS_PAGE_NAME) ||
      createStablePenpotUuid("penpot-assets-page:images");
    const document = compileAssetPageDocument(
      PENPOT_IMAGE_ASSETS_PAGE_NAME,
      buildImageAssetsPageMarkup(imageAssets),
      assets,
    );
    for (const url of collectImageAssetUrls(document)) {
      imageAssetUrls.add(url);
    }
    const replacement = findPageIdByName(file, PENPOT_IMAGE_ASSETS_PAGE_NAME)
      ? buildReplacePageChanges(file, document, pageId, mediaObjectsByAssetUrl)
      : buildCreatePageChanges(document, pageId, mediaObjectsByAssetUrl);
    pageChanges.push(...replacement.changes);
  }

  return {
    pageChanges,
    componentBindings,
    imageAssetUrls: [...imageAssetUrls],
  } satisfies PenpotAssetSyncPlan;
};

const summarizePenpotChanges = (changes: Record<string, unknown>[]) => {
  const byChangeType: Record<string, number> = {};
  const addObjByShapeType: Record<string, number> = {};
  const samples: Array<Record<string, unknown>> = [];

  for (const change of changes) {
    const changeType = typeof change.type === "string" ? change.type : "unknown";
    byChangeType[changeType] = (byChangeType[changeType] || 0) + 1;

    if (changeType === "add-obj") {
      const obj =
        typeof change.obj === "object" && change.obj !== null && !Array.isArray(change.obj)
          ? (change.obj as Record<string, unknown>)
          : null;
      const shapeType = typeof obj?.type === "string" ? obj.type : "unknown";
      addObjByShapeType[shapeType] = (addObjByShapeType[shapeType] || 0) + 1;

      if (samples.length < 12) {
        samples.push({
          id: typeof change.id === "string" ? change.id : undefined,
          pageId: typeof change["page-id"] === "string" ? change["page-id"] : undefined,
          parentId: typeof change["parent-id"] === "string" ? change["parent-id"] : undefined,
          frameId: typeof change["frame-id"] === "string" ? change["frame-id"] : undefined,
          shapeType,
          name: typeof obj?.name === "string" ? obj.name : undefined,
          width: typeof obj?.width === "number" ? obj.width : undefined,
          height: typeof obj?.height === "number" ? obj.height : undefined,
        });
      }
    }
  }

  return {
    total: changes.length,
    byChangeType,
    addObjByShapeType,
    samples,
  };
};

const getBoundPenpotFile = async (taskId: string, pageId: string) => {
  const config = readPenpotSyncConfig();
  ensurePenpotReadAccess(config);

  const binding = readPenpotBinding(taskId, pageId);
  if (!binding) {
    throw new Error("当前页面还没有绑定 Penpot 文件");
  }

  const target = parsePenpotBindingUrl(binding.penpotUrl);
  if (!target?.fileId || !target.pageId) {
    throw new Error("Penpot 绑定地址无效，无法解析 fileId/pageId");
  }

  const file = await callPenpotRpc<PenpotRpcFile>(config, "get-file", {
    id: target.fileId,
  });

  return {
    config,
    binding,
    file,
    fileId: target.fileId,
    pageId: target.pageId,
  };
};

const resolveWritablePenpotTarget = async (
  taskId: string,
  localPageId: string,
  config: ReturnType<typeof readPenpotSyncConfig>,
  existingBinding: ReturnType<typeof readPenpotBinding>,
  documentName: string,
) => {
  const existingTarget = existingBinding ? parsePenpotBindingUrl(existingBinding.penpotUrl) : null;

  if (existingTarget) {
    const targetFile = await callPenpotRpc<PenpotRpcFile>(config, "get-file", {
      id: existingTarget.fileId,
    });
    const targetFileId = targetFile.id;
    const targetPageId = existingTarget.pageId || targetFile.data?.pages?.[0] || "";

    if (!targetFileId || !targetPageId) {
      throw new Error("现有 Penpot 文件缺少 fileId 或 pageId，无法复用");
    }

    return {
      targetFile,
      targetFileId,
      targetPageId,
      existingBinding,
      needsAddPage: false,
      reusedTaskFile: false,
    };
  }

  const sharedBindingEntry = listPenpotBindings(taskId)
    .filter((entry) => entry.localPageId !== localPageId && entry.target?.fileId)
    .sort((left, right) => {
      const leftTime = Date.parse(left.binding.updatedAt || "");
      const rightTime = Date.parse(right.binding.updatedAt || "");
      return (Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime);
    })[0];

  if (sharedBindingEntry?.target?.fileId) {
    const targetFile = await callPenpotRpc<PenpotRpcFile>(config, "get-file", {
      id: sharedBindingEntry.target.fileId,
    });
    const targetFileId = targetFile.id;
    const targetPageId = randomUUID();

    if (!targetFileId || !targetPageId) {
      throw new Error("共享 Penpot 文件缺少 fileId 或 pageId，无法创建新页面");
    }

    return {
      targetFile,
      targetFileId,
      targetPageId,
      existingBinding: null,
      needsAddPage: true,
      reusedTaskFile: true,
    };
  }

  const targetFile = await callPenpotRpc<PenpotRpcFile>(config, "create-file", {
    name: documentName,
    "project-id": config.projectId,
  });

  const targetFileId = targetFile.id;
  const targetPageId = targetFile?.data?.pages?.[0] || "";

  if (!targetFileId || !targetPageId) {
    throw new Error("Penpot create-file 返回结果缺少 fileId 或 pageId");
  }

  return {
    targetFile,
    targetFileId,
    targetPageId,
    existingBinding: null,
    needsAddPage: false,
    reusedTaskFile: false,
  };
};

export const getPenpotRemoteState = async (
  taskId: string,
  pageId: string,
): Promise<PenpotRemoteState> => {
  const { binding, file } = await getBoundPenpotFile(taskId, pageId);
  const remoteRevision = typeof file.revn === "number" ? file.revn : null;
  const remoteVersion = typeof file.vern === "number" ? file.vern : null;
  const lastReverseSyncRevision =
    typeof binding.lastReverseSyncRevision === "number" ? binding.lastReverseSyncRevision : null;

  return {
    remoteRevision,
    remoteVersion,
    lastForwardSyncRevision:
      typeof binding.lastForwardSyncRevision === "number" ? binding.lastForwardSyncRevision : null,
    lastReverseSyncRevision,
    lastReverseSyncedAt: binding.lastReverseSyncedAt || null,
    hasRemoteChanges: remoteRevision !== null && remoteRevision !== lastReverseSyncRevision,
  };
};

export const importPenpotToDesignDoc = async (taskId: string, pageId: string) => {
  const { binding, file, fileId, pageId: penpotPageId } = await getBoundPenpotFile(taskId, pageId);
  const existing = readStoredDesignDoc(taskId, pageId);
  const existingDocument =
    existing?.validation.valid && existing.validation.document
      ? existing.validation.document
      : null;
  const document = convertPenpotFileToDesignDoc(
    file,
    penpotPageId,
    existingDocument,
    binding.anchors || {},
  );
  const validation = validateExecutableDesignDoc(document);
  if (!validation.valid || !validation.document) {
    throw new Error(`Penpot 回写后的 design doc 未通过校验: ${validation.errors.join("; ")}`);
  }

  const now = new Date().toISOString();
  writeStoredDesignDoc(taskId, pageId, {
    schemaVersion: existing?.stored.schemaVersion || 3,
    pageId,
    title: existing?.stored.title || validation.document.page.name,
    createdAt: existing?.stored.createdAt || now,
    updatedAt: now,
    document: validation.document,
  });

  const remoteRevision = typeof file.revn === "number" ? file.revn : undefined;
  const remoteVersion = typeof file.vern === "number" ? file.vern : undefined;
  writePenpotBinding(taskId, pageId, binding.penpotUrl, {
    remoteRevision,
    remoteVersion,
    lastForwardSyncRevision: binding.lastForwardSyncRevision,
    lastReverseSyncRevision: remoteRevision,
    lastReverseSyncedAt: now,
    anchors: binding.anchors,
    mediaObjects: binding.mediaObjects,
    components: binding.components,
  });

  return {
    fileId,
    pageId: penpotPageId,
    remoteRevision: remoteRevision ?? null,
    updatedAt: now,
    summary: {
      pageName: validation.document.page.name,
      width: validation.document.page.width,
      minHeight: validation.document.page.minHeight,
      sectionCount: validation.document.sections.length,
    },
  };
};

export const syncDesignDocToPenpot = async (
  taskId: string,
  pageId: string,
): Promise<PenpotSyncResult> => {
  const designDocResult = readStoredDesignDoc(taskId, pageId);
  if (
    !designDocResult ||
    !designDocResult.validation.valid ||
    !designDocResult.validation.document
  ) {
    throw new Error("设计稿不存在或未通过 schema 校验，无法同步到 Penpot");
  }

  const designDocSummary = summarizeDesignDocForSync(designDocResult.validation.document);
  const config = readPenpotSyncConfig();
  ensurePenpotWriteAccess(config);

  const existingBinding = readPenpotBinding(taskId, pageId);
  const { targetFile, targetFileId, targetPageId, needsAddPage, reusedTaskFile } =
    await resolveWritablePenpotTarget(
      taskId,
      pageId,
      config,
      existingBinding,
      designDocResult.stored.title || designDocResult.validation.document.page.name,
    );
  const assetPreviewPlan = buildAssetSyncPlan(
    taskId,
    targetFile,
    targetFileId,
    {},
    existingBinding?.components,
  );
  const { mediaObjectsByAssetUrl, mediaBindings } = await ensurePenpotMediaObjects(
    config,
    targetFileId,
    [
      ...new Set([
        ...collectImageAssetUrls(designDocResult.validation.document),
        ...assetPreviewPlan.imageAssetUrls,
      ]),
    ],
    existingBinding?.mediaObjects,
  );
  const assetPlan = buildAssetSyncPlan(
    taskId,
    targetFile,
    targetFileId,
    mediaObjectsByAssetUrl,
    existingBinding?.components,
  );

  const replacement = needsAddPage
    ? buildCreatePageChanges(
        designDocResult.validation.document,
        targetPageId,
        mediaObjectsByAssetUrl,
        assetPlan.componentBindings,
      )
    : buildReplacePageChanges(
        targetFile,
        designDocResult.validation.document,
        targetPageId,
        mediaObjectsByAssetUrl,
        assetPlan.componentBindings,
      );
  const combinedChanges = [...assetPlan.pageChanges, ...replacement.changes];
  const changeSummary = summarizePenpotChanges(combinedChanges);

  logger.info("[PenpotSync] update-file request prepared", {
    taskId,
    pageId,
    targetFileId,
    targetPageId,
    existingBinding: Boolean(existingBinding),
    needsAddPage,
    reusedTaskFile,
    remoteRevision: typeof targetFile.revn === "number" ? targetFile.revn : null,
    remoteVersion: typeof targetFile.vern === "number" ? targetFile.vern : null,
    designDoc: designDocSummary,
    changeSummary,
  });

  try {
    await callPenpotRpc(config, "update-file", {
      id: targetFileId,
      "session-id": randomUUID(),
      revn: typeof targetFile.revn === "number" ? targetFile.revn : 0,
      vern: typeof targetFile.vern === "number" ? targetFile.vern : 0,
      changes: combinedChanges,
      "skip-validate": false,
    });
  } catch (error) {
    logger.error("[PenpotSync] update-file failed", {
      taskId,
      pageId,
      targetFileId,
      targetPageId,
      needsAddPage,
      reusedTaskFile,
      error: error instanceof Error ? error.message : String(error),
      designDoc: designDocSummary,
      changeSummary,
    });
    throw error;
  }

  const updatedFile = await callPenpotRpc<PenpotRpcFile>(config, "get-file", {
    id: targetFileId,
  });
  const fileUrl = buildWorkspaceUrl(config, targetFileId, targetPageId);
  const remoteRevision = typeof updatedFile.revn === "number" ? updatedFile.revn : undefined;
  const remoteVersion = typeof updatedFile.vern === "number" ? updatedFile.vern : undefined;
  writePenpotBinding(taskId, pageId, fileUrl, {
    remoteRevision,
    remoteVersion,
    lastForwardSyncRevision: remoteRevision,
    lastReverseSyncRevision: remoteRevision,
    lastReverseSyncedAt: new Date().toISOString(),
    anchors: replacement.anchors,
    mediaObjects: mediaBindings,
    components: assetPlan.componentBindings,
  });

  return {
    fileId: targetFileId,
    pageId: targetPageId,
    projectId: config.projectId,
    teamId: config.teamId,
    fileUrl,
  };
};

export const syncDesignDocSectionToPenpot = async (
  taskId: string,
  pageId: string,
  sectionId: string,
): Promise<PenpotSyncResult> => {
  const designDocResult = readStoredDesignDoc(taskId, pageId);
  if (
    !designDocResult ||
    !designDocResult.validation.valid ||
    !designDocResult.validation.document
  ) {
    throw new Error("设计稿不存在或未通过 schema 校验，无法同步到 Penpot");
  }

  const document = designDocResult.validation.document;
  const sectionIndex = document.sections.findIndex((section) => section.id === sectionId);
  if (sectionIndex === -1) {
    throw new Error(`未找到区块 ${sectionId}，无法同步到 Penpot`);
  }

  const affectedSectionIds = document.sections.slice(sectionIndex).map((section) => section.id);
  const designDocSummary = summarizeDesignDocForSync(document);
  const config = readPenpotSyncConfig();
  ensurePenpotWriteAccess(config);

  const existingBinding = readPenpotBinding(taskId, pageId);
  const { targetFile, targetFileId, targetPageId, needsAddPage, reusedTaskFile } =
    await resolveWritablePenpotTarget(
      taskId,
      pageId,
      config,
      existingBinding,
      designDocResult.stored.title || document.page.name,
    );
  const assetPreviewPlan = buildAssetSyncPlan(
    taskId,
    targetFile,
    targetFileId,
    {},
    existingBinding?.components,
  );
  const { mediaObjectsByAssetUrl, mediaBindings } = await ensurePenpotMediaObjects(
    config,
    targetFileId,
    [...new Set([...collectImageAssetUrls(document), ...assetPreviewPlan.imageAssetUrls])],
    existingBinding?.mediaObjects,
  );
  const assetPlan = buildAssetSyncPlan(
    taskId,
    targetFile,
    targetFileId,
    mediaObjectsByAssetUrl,
    existingBinding?.components,
  );

  const replacement = needsAddPage
    ? buildCreatePageChanges(
        document,
        targetPageId,
        mediaObjectsByAssetUrl,
        assetPlan.componentBindings,
      )
    : buildReplaceSectionChanges(
        targetFile,
        document,
        targetPageId,
        affectedSectionIds,
        mediaObjectsByAssetUrl,
        assetPlan.componentBindings,
      );
  const combinedChanges = [...assetPlan.pageChanges, ...replacement.changes];
  const changeSummary = summarizePenpotChanges(combinedChanges);

  logger.info("[PenpotSync] update-file request prepared (section)", {
    taskId,
    pageId,
    sectionId,
    affectedSectionIds,
    targetFileId,
    targetPageId,
    existingBinding: Boolean(existingBinding),
    needsAddPage,
    reusedTaskFile,
    remoteRevision: typeof targetFile.revn === "number" ? targetFile.revn : null,
    remoteVersion: typeof targetFile.vern === "number" ? targetFile.vern : null,
    designDoc: designDocSummary,
    changeSummary,
  });

  try {
    await callPenpotRpc(config, "update-file", {
      id: targetFileId,
      "session-id": randomUUID(),
      revn: typeof targetFile.revn === "number" ? targetFile.revn : 0,
      vern: typeof targetFile.vern === "number" ? targetFile.vern : 0,
      changes: combinedChanges,
      "skip-validate": false,
    });
  } catch (error) {
    logger.error("[PenpotSync] update-file failed (section)", {
      taskId,
      pageId,
      sectionId,
      affectedSectionIds,
      targetFileId,
      targetPageId,
      needsAddPage,
      reusedTaskFile,
      error: error instanceof Error ? error.message : String(error),
      designDoc: designDocSummary,
      changeSummary,
    });
    throw error;
  }

  const updatedFile = await callPenpotRpc<PenpotRpcFile>(config, "get-file", {
    id: targetFileId,
  });
  const fileUrl = buildWorkspaceUrl(config, targetFileId, targetPageId);
  const remoteRevision = typeof updatedFile.revn === "number" ? updatedFile.revn : undefined;
  const remoteVersion = typeof updatedFile.vern === "number" ? updatedFile.vern : undefined;
  writePenpotBinding(taskId, pageId, fileUrl, {
    remoteRevision,
    remoteVersion,
    lastForwardSyncRevision: remoteRevision,
    lastReverseSyncRevision: remoteRevision,
    lastReverseSyncedAt: new Date().toISOString(),
    anchors: {
      ...(existingBinding?.anchors || {}),
      ...replacement.anchors,
    },
    mediaObjects: mediaBindings,
    components: assetPlan.componentBindings,
  });

  return {
    fileId: targetFileId,
    pageId: targetPageId,
    projectId: config.projectId,
    teamId: config.teamId,
    fileUrl,
  };
};

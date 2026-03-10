import { randomUUID } from "node:crypto";
import { validateExecutableDesignDoc } from "../designDocSchema";
import { readStoredDesignDoc, writeStoredDesignDoc } from "../designDocs";
import { parsePenpotBindingUrl, readPenpotBinding, writePenpotBinding } from "../penpotBindings";
import {
  buildWorkspaceUrl,
  callPenpotRpc,
  ensurePenpotReadAccess,
  ensurePenpotWriteAccess,
  readPenpotSyncConfig,
} from "./config";
import { buildReplacePageChanges } from "./exportBuilders";
import { convertPenpotFileToDesignDoc } from "./importTransform";
import type { PenpotRemoteState, PenpotRpcFile, PenpotSyncResult } from "./types";

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
  const document = convertPenpotFileToDesignDoc(file, penpotPageId, existingDocument);
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

  const config = readPenpotSyncConfig();
  ensurePenpotWriteAccess(config);

  const existingBinding = readPenpotBinding(taskId, pageId);
  const existingTarget = existingBinding ? parsePenpotBindingUrl(existingBinding.penpotUrl) : null;

  let targetFile: PenpotRpcFile;
  let targetFileId: string;
  let targetPageId: string;

  if (existingTarget) {
    targetFile = await callPenpotRpc<PenpotRpcFile>(config, "get-file", {
      id: existingTarget.fileId,
    });

    targetFileId = targetFile.id;
    targetPageId = existingTarget.pageId || targetFile.data?.pages?.[0] || "";

    if (!targetFileId || !targetPageId) {
      throw new Error("现有 Penpot 文件缺少 fileId 或 pageId，无法复用");
    }
  } else {
    targetFile = await callPenpotRpc<PenpotRpcFile>(config, "create-file", {
      name: designDocResult.stored.title || designDocResult.validation.document.page.name,
      "project-id": config.projectId,
    });

    targetFileId = targetFile.id;
    targetPageId = targetFile?.data?.pages?.[0] || "";

    if (!targetFileId || !targetPageId) {
      throw new Error("Penpot create-file 返回结果缺少 fileId 或 pageId");
    }
  }

  await callPenpotRpc(config, "update-file", {
    id: targetFileId,
    "session-id": randomUUID(),
    revn: typeof targetFile.revn === "number" ? targetFile.revn : 0,
    vern: typeof targetFile.vern === "number" ? targetFile.vern : 0,
    changes: buildReplacePageChanges(targetFile, designDocResult.validation.document, targetPageId),
    "skip-validate": false,
  });

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
  });

  return {
    fileId: targetFileId,
    pageId: targetPageId,
    projectId: config.projectId,
    teamId: config.teamId,
    fileUrl,
  };
};

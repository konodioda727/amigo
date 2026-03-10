import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getGlobalState } from "@amigo-llm/backend";

const PENPOT_BINDINGS_DIRNAME = "penpotBindings";

export interface PenpotBinding {
  pageId: string;
  penpotUrl: string;
  updatedAt: string;
  remoteRevision?: number;
  remoteVersion?: number;
  lastForwardSyncRevision?: number;
  lastReverseSyncRevision?: number;
  lastReverseSyncedAt?: string;
}

export const getPenpotBaseUrl = () =>
  (process.env.PENPOT_BASE_URL || "http://localhost:9001").trim().replace(/\/+$/, "");

const normalizePageId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const getBindingsPath = (taskId: string) =>
  path.join(getGlobalState("globalStoragePath") || process.cwd(), taskId, PENPOT_BINDINGS_DIRNAME);

export const parsePenpotBindingUrl = (
  penpotUrl: string,
): { fileId: string; pageId: string } | null => {
  try {
    const url = new URL(penpotUrl);
    const hash = url.hash || "";
    const queryIndex = hash.indexOf("?");
    if (queryIndex === -1) return null;
    const params = new URLSearchParams(hash.slice(queryIndex + 1));
    const fileId = params.get("file-id") || "";
    const pageId = params.get("page-id") || "";
    return fileId && pageId ? { fileId, pageId } : null;
  } catch {
    return null;
  }
};

const ensureDirectoryExists = (directory: string) => {
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
};

export const readPenpotBinding = (taskId: string, pageId: string): PenpotBinding | null => {
  const normalizedPageId = normalizePageId(pageId);
  const filePath = path.join(getBindingsPath(taskId), `${normalizedPageId}.json`);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.pageId !== "string" ||
      typeof parsed.penpotUrl !== "string"
    ) {
      return null;
    }

    return {
      pageId: parsed.pageId,
      penpotUrl: parsed.penpotUrl,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      remoteRevision: typeof parsed.remoteRevision === "number" ? parsed.remoteRevision : undefined,
      remoteVersion: typeof parsed.remoteVersion === "number" ? parsed.remoteVersion : undefined,
      lastForwardSyncRevision:
        typeof parsed.lastForwardSyncRevision === "number"
          ? parsed.lastForwardSyncRevision
          : undefined,
      lastReverseSyncRevision:
        typeof parsed.lastReverseSyncRevision === "number"
          ? parsed.lastReverseSyncRevision
          : undefined,
      lastReverseSyncedAt:
        typeof parsed.lastReverseSyncedAt === "string" ? parsed.lastReverseSyncedAt : undefined,
    };
  } catch {
    return null;
  }
};

export const writePenpotBinding = (
  taskId: string,
  pageId: string,
  penpotUrl: string,
  metadata?: Partial<Omit<PenpotBinding, "pageId" | "penpotUrl" | "updatedAt">>,
) => {
  const normalizedPageId = normalizePageId(pageId);
  const bindingsPath = getBindingsPath(taskId);
  const filePath = path.join(bindingsPath, `${normalizedPageId}.json`);
  ensureDirectoryExists(bindingsPath);

  const record: PenpotBinding = {
    pageId: normalizedPageId,
    penpotUrl: penpotUrl.trim(),
    updatedAt: new Date().toISOString(),
    remoteRevision: metadata?.remoteRevision,
    remoteVersion: metadata?.remoteVersion,
    lastForwardSyncRevision: metadata?.lastForwardSyncRevision,
    lastReverseSyncRevision: metadata?.lastReverseSyncRevision,
    lastReverseSyncedAt: metadata?.lastReverseSyncedAt,
  };

  writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  return record;
};

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getTaskStoragePath } from "@amigo-llm/backend";
import { getConfiguredPenpotConfig } from "../../config/runtimeConfig";

const PENPOT_BINDINGS_DIRNAME = "penpotBindings";

export interface PenpotSemanticAnchor {
  entityType: "section" | "node";
  semanticId: string;
  displayName: string;
}

export type PenpotSemanticAnchorMap = Record<string, PenpotSemanticAnchor>;

export interface PenpotMediaObjectBinding {
  id: string;
  mediaId?: string;
  thumbnailId?: string;
  name?: string;
  width?: number;
  height?: number;
  mtype?: string;
  isLocal?: boolean;
  createdAt?: string;
}

export type PenpotMediaObjectMap = Record<string, PenpotMediaObjectBinding>;

export interface PenpotComponentBinding {
  componentId: string;
  fileId: string;
  pageId: string;
  mainInstanceId: string;
  sourceParentSeed: string;
  sourceInstanceNodeId: string;
  name?: string;
  path?: string;
}

export type PenpotComponentMap = Record<string, PenpotComponentBinding>;

export interface PenpotBinding {
  pageId: string;
  penpotUrl: string;
  publicUrl?: string;
  updatedAt: string;
  remoteRevision?: number;
  remoteVersion?: number;
  lastForwardSyncRevision?: number;
  lastReverseSyncRevision?: number;
  lastReverseSyncedAt?: string;
  anchors?: PenpotSemanticAnchorMap;
  mediaObjects?: PenpotMediaObjectMap;
  components?: PenpotComponentMap;
}

export interface PenpotBindingEntry {
  localPageId: string;
  binding: PenpotBinding;
  target: { fileId: string; pageId: string } | null;
}

export const getPenpotBaseUrl = () =>
  (getConfiguredPenpotConfig()?.baseUrl || process.env.PENPOT_BASE_URL || "http://localhost:9001")
    .trim()
    .replace(/\/+$/, "");

const normalizePageId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const getBindingsPath = (taskId: string) =>
  path.join(getTaskStoragePath(taskId), PENPOT_BINDINGS_DIRNAME);

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
      publicUrl: typeof parsed.publicUrl === "string" ? parsed.publicUrl : undefined,
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
      anchors: parsed.anchors && typeof parsed.anchors === "object" ? parsed.anchors : undefined,
      mediaObjects:
        parsed.mediaObjects && typeof parsed.mediaObjects === "object"
          ? parsed.mediaObjects
          : undefined,
      components:
        parsed.components && typeof parsed.components === "object" ? parsed.components : undefined,
    };
  } catch {
    return null;
  }
};

export const listPenpotBindings = (taskId: string): PenpotBindingEntry[] => {
  const bindingsPath = getBindingsPath(taskId);
  if (!existsSync(bindingsPath)) {
    return [];
  }

  return readdirSync(bindingsPath)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const localPageId = normalizePageId(name.replace(/\.json$/i, ""));
      const binding = readPenpotBinding(taskId, localPageId);
      if (!binding) {
        return null;
      }

      return {
        localPageId,
        binding,
        target: parsePenpotBindingUrl(binding.penpotUrl),
      } satisfies PenpotBindingEntry;
    })
    .filter((entry): entry is PenpotBindingEntry => Boolean(entry));
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
    publicUrl: metadata?.publicUrl?.trim() || undefined,
    updatedAt: new Date().toISOString(),
    remoteRevision: metadata?.remoteRevision,
    remoteVersion: metadata?.remoteVersion,
    lastForwardSyncRevision: metadata?.lastForwardSyncRevision,
    lastReverseSyncRevision: metadata?.lastReverseSyncRevision,
    lastReverseSyncedAt: metadata?.lastReverseSyncedAt,
    anchors: metadata?.anchors,
    mediaObjects: metadata?.mediaObjects,
    components: metadata?.components,
  };

  writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  return record;
};

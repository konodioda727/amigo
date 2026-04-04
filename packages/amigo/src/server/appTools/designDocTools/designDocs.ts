import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getTaskStoragePath, logger } from "@amigo-llm/backend";
import type { ExecutableDesignDoc } from "./designDocSchema";
import { validateExecutableDesignDoc } from "./designDocSchema";

const DESIGN_DOCS_DIRNAME = "designDocs";

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

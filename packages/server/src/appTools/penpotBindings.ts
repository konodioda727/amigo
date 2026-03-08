import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getGlobalState } from "@/globalState";

const PENPOT_BINDINGS_DIRNAME = "penpotBindings";

export interface PenpotBinding {
  pageId: string;
  penpotUrl: string;
  updatedAt: string;
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
    };
  } catch {
    return null;
  }
};

export const writePenpotBinding = (taskId: string, pageId: string, penpotUrl: string) => {
  const normalizedPageId = normalizePageId(pageId);
  const bindingsPath = getBindingsPath(taskId);
  const filePath = path.join(bindingsPath, `${normalizedPageId}.json`);
  ensureDirectoryExists(bindingsPath);

  const record: PenpotBinding = {
    pageId: normalizedPageId,
    penpotUrl: penpotUrl.trim(),
    updatedAt: new Date().toISOString(),
  };

  writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  return record;
};

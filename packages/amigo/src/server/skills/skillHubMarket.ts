import { execFile } from "node:child_process";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { SkillDefinition } from "@amigo-llm/backend";
import { z } from "zod";
import type { SkillStore } from "./skillStore";

const execFileAsync = promisify(execFile);
const DEFAULT_MARKET_LIMIT = 24;

const SkillHubMarketSkillSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  author: z.string().optional(),
  score: z.number().optional(),
  stars: z.number().optional(),
  detailUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
  categories: z.array(z.string()).optional(),
});

export const SkillHubMarketSearchInputSchema = z.object({
  query: z.string().trim().min(1),
  limit: z.number().int().min(1).max(100).optional(),
  category: z.string().trim().min(1).optional(),
  method: z.enum(["hybrid", "embedding", "fulltext"]).optional(),
});

export const SkillHubMarketCatalogInputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  sort: z.enum(["score", "stars", "recent", "composite"]).optional(),
  category: z.string().trim().min(1).optional(),
});

export const SkillHubMarketImportInputSchema = SkillHubMarketSkillSchema.pick({
  id: true,
  slug: true,
  name: true,
});

export type SkillHubMarketSkill = z.infer<typeof SkillHubMarketSkillSchema>;
export type SkillHubMarketSearchInput = z.infer<typeof SkillHubMarketSearchInputSchema>;
export type SkillHubMarketCatalogInput = z.infer<typeof SkillHubMarketCatalogInputSchema>;
export type SkillHubMarketImportInput = z.infer<typeof SkillHubMarketImportInputSchema>;

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "skill";

const LOCATION_LINE_PATTERN = /Location:\s+(.+)/;

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForPath = async (
  targetPath: string,
  options: { retries?: number; intervalMs?: number } = {},
): Promise<boolean> => {
  const retries = options.retries ?? 10;
  const intervalMs = options.intervalMs ?? 100;

  for (let index = 0; index < retries; index += 1) {
    if (await pathExists(targetPath)) {
      return true;
    }
    await sleep(intervalMs);
  }

  return false;
};

const findInstalledSkillDir = async (rootDir: string, depth = 0): Promise<string | null> => {
  if (depth > 3) {
    return null;
  }

  const skillMarkerPath = path.join(rootDir, "SKILL.md");
  if (await pathExists(skillMarkerPath)) {
    return rootDir;
  }

  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const found = await findInstalledSkillDir(path.join(rootDir, entry.name), depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
};

const resolveInstalledSkillDirFromCliOutput = async (
  cliOutput: string,
  tempRoot: string,
): Promise<string | null> => {
  const locationLine = cliOutput.match(LOCATION_LINE_PATTERN)?.[1]?.trim();
  if (locationLine) {
    const resolvedPath = path.isAbsolute(locationLine)
      ? locationLine
      : path.resolve(tempRoot, locationLine);
    if (await waitForPath(path.join(resolvedPath, "SKILL.md"))) {
      return resolvedPath;
    }
  }

  for (let index = 0; index < 10; index += 1) {
    const found = await findInstalledSkillDir(tempRoot);
    if (found) {
      return found;
    }
    await sleep(100);
  }

  return null;
};

const extractJsonPayload = (stdout: string): unknown => {
  const startIndex = stdout.indexOf("[");
  const endIndex = stdout.lastIndexOf("]");
  if (startIndex < 0 || endIndex < startIndex) {
    throw new Error("SkillHub CLI 输出中未找到 JSON 结果");
  }
  return JSON.parse(stdout.slice(startIndex, endIndex + 1));
};

const normalizeSkillHubMarketSkill = (
  skill: Record<string, unknown>,
): SkillHubMarketSkill | null => {
  const slug = normalizeString(skill.slug) || normalizeString(skill.id);
  const name = normalizeString(skill.name);
  const description =
    normalizeString(skill.description_zh) || normalizeString(skill.description) || "No description";

  if (!slug || !name) {
    return null;
  }

  const category = normalizeString(skill.category);
  const tags = Array.isArray(skill.tags)
    ? skill.tags.map((value) => normalizeString(value)).filter((value): value is string => !!value)
    : [];

  return SkillHubMarketSkillSchema.parse({
    id: normalizeString(skill.id) || slug,
    slug,
    name,
    description,
    author: normalizeString(skill.author),
    score: normalizeNumber(skill.simple_score),
    stars: normalizeNumber(skill.github_stars),
    detailUrl: `https://www.skillhub.club/skills/${slug}`,
    sourceUrl: normalizeString(skill.repo_url),
    categories: category ? [category, ...tags] : tags,
  });
};

const toRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === "object" && !Array.isArray(item),
      )
    : [];

export class SkillHubMarketClient {
  isConfigured(): boolean {
    return true;
  }

  async browseCatalog(input: SkillHubMarketCatalogInput = {}): Promise<SkillHubMarketSkill[]> {
    const sort = input.sort || "score";
    const command =
      sort === "recent"
        ? "latest"
        : sort === "stars"
          ? "top"
          : sort === "composite"
            ? "top"
            : "trending";

    const args = [
      command,
      "--limit",
      String(input.limit || DEFAULT_MARKET_LIMIT),
      ...(input.category ? ["--category", input.category] : []),
      "--json",
    ];

    return this.runListCommand(args);
  }

  async searchSkills(input: SkillHubMarketSearchInput): Promise<SkillHubMarketSkill[]> {
    const args = [
      "search",
      input.query,
      "--limit",
      String(input.limit || DEFAULT_MARKET_LIMIT),
      ...(input.category ? ["--category", input.category] : []),
      "--json",
    ];
    return this.runListCommand(args);
  }

  async importSkill(
    input: SkillHubMarketImportInput,
    skillStore: SkillStore,
  ): Promise<SkillDefinition> {
    const normalizedInput = SkillHubMarketImportInputSchema.parse(input);
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "amigo-skillhub-"));

    try {
      const cliOutput = await this.runCliCommand([
        "install",
        normalizedInput.slug || normalizedInput.name,
        "--agent",
        "codex",
        "--dir",
        tempRoot,
        "-y",
      ]);

      const installedDir = await resolveInstalledSkillDirFromCliOutput(cliOutput, tempRoot);
      if (!installedDir) {
        throw new Error("SkillHub 安装完成，但未找到导出的 skill 目录或 SKILL.md");
      }

      return await skillStore.importFromDirectory(installedDir, {
        id: normalizedInput.slug || slugify(normalizedInput.name),
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  private async runListCommand(args: string[]): Promise<SkillHubMarketSkill[]> {
    const stdout = await this.runCliCommand(args);
    return toRecordArray(extractJsonPayload(stdout))
      .map(normalizeSkillHubMarketSkill)
      .filter((item): item is SkillHubMarketSkill => !!item);
  }

  private async runCliCommand(args: string[]): Promise<string> {
    try {
      const { stdout, stderr } = await execFileAsync("npx", ["-y", "@skill-hub/cli", ...args], {
        maxBuffer: 1024 * 1024 * 8,
      });
      return [stdout, stderr].filter(Boolean).join("\n");
    } catch (error) {
      const message =
        error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string"
          ? error.stderr
          : error instanceof Error
            ? error.message
            : String(error);
      throw new Error(`SkillHub CLI 调用失败: ${message.trim()}`);
    }
  }
}

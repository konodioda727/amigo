import type { Dirent } from "node:fs";
import { chmod, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseSkillMarkdown,
  type SkillBundle,
  type SkillBundleFile,
  SkillBundleSchema,
  type SkillDefinition,
  SkillDefinitionSchema,
  type SkillProvider,
  type SkillResourceManifest,
  SkillResourceManifestSchema,
  type SkillSummary,
  SkillSummarySchema,
  type SkillUpsertInput,
} from "@amigo-llm/backend";
import type { RowDataPacket } from "mysql2/promise";
import {
  ensureMysqlSchemaUpToDate,
  isMysqlConfigured,
  mysqlExecute,
  mysqlQuery,
  parseJsonColumn,
} from "../db";

const SKILL_MARKDOWN_FILE = "SKILL.md";

const normalizeRelativePath = (value: string): string => value.replace(/\\/g, "/");

const sortPaths = (values: string[]): string[] =>
  [...values].sort((a, b) => a.localeCompare(b, "en"));

type SkillRow = RowDataPacket & {
  id: string;
  user_id: string;
  name: string;
  description: string;
  skill_markdown: string;
  resource_manifest_json: unknown;
  path: string;
  created_at: string;
  updated_at: string;
};

const parseDateTime = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const raw = String(value || "").trim();
  if (!raw) {
    return new Date(0).toISOString();
  }
  if (raw.includes("T")) {
    return new Date(raw).toISOString();
  }
  return new Date(`${raw.replace(" ", "T")}Z`).toISOString();
};

const buildResourceManifest = (relativePaths: string[]): SkillResourceManifest => {
  const manifest: SkillResourceManifest = {
    scripts: [],
    references: [],
    assets: [],
    agents: [],
    extraFiles: [],
  };

  for (const filePath of relativePaths) {
    if (filePath === SKILL_MARKDOWN_FILE) {
      continue;
    }
    if (filePath.startsWith("scripts/")) {
      manifest.scripts.push(filePath);
      continue;
    }
    if (filePath.startsWith("references/")) {
      manifest.references.push(filePath);
      continue;
    }
    if (filePath.startsWith("assets/")) {
      manifest.assets.push(filePath);
      continue;
    }
    if (filePath.startsWith("agents/")) {
      manifest.agents.push(filePath);
      continue;
    }
    manifest.extraFiles.push(filePath);
  }

  return SkillResourceManifestSchema.parse({
    scripts: sortPaths(manifest.scripts),
    references: sortPaths(manifest.references),
    assets: sortPaths(manifest.assets),
    agents: sortPaths(manifest.agents),
    extraFiles: sortPaths(manifest.extraFiles),
  });
};

const mapSkillRow = (row: SkillRow): SkillDefinition => {
  const resourceManifest = SkillResourceManifestSchema.parse(
    parseJsonColumn<SkillResourceManifest>(row.resource_manifest_json, {
      scripts: [],
      references: [],
      assets: [],
      agents: [],
      extraFiles: [],
    }),
  );

  return SkillDefinitionSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    path: row.path,
    resourceManifest,
    skillMarkdown: row.skill_markdown,
    createdAt: parseDateTime(row.created_at),
    updatedAt: parseDateTime(row.updated_at),
  });
};

export class SkillStore implements SkillProvider {
  private readonly skillsDir: string;

  constructor(cachePath: string) {
    this.skillsDir = path.join(cachePath, "skills");
  }

  async init(): Promise<void> {
    if (isMysqlConfigured()) {
      await ensureMysqlSchemaUpToDate();
    }

    await mkdir(this.skillsDir, { recursive: true });
  }

  async list(userId?: string): Promise<SkillSummary[]> {
    if (isMysqlConfigured()) {
      await this.init();
      const rows = userId?.trim()
        ? await mysqlQuery<SkillRow>(
            "SELECT * FROM skills WHERE user_id = ? ORDER BY updated_at DESC",
            [userId.trim()],
          )
        : await mysqlQuery<SkillRow>("SELECT * FROM skills ORDER BY updated_at DESC");
      const skills = await Promise.all(rows.map((row) => this.hydrateDatabaseSkill(row)));
      return skills
        .map(({ skillMarkdown: _skillMarkdown, ...summary }) => summary)
        .map((summary) => SkillSummarySchema.parse(summary));
    }

    await this.init();
    const entries = await readdir(this.skillsDir, { withFileTypes: true });
    const skills = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => this.readSummary(entry.name))
        .filter(Boolean),
    );
    return skills
      .filter((skill): skill is SkillSummary => !!skill)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string, userId?: string): Promise<SkillDefinition | null> {
    if (isMysqlConfigured()) {
      await this.init();
      const rows = userId?.trim()
        ? await mysqlQuery<SkillRow>("SELECT * FROM skills WHERE id = ? AND user_id = ? LIMIT 1", [
            id,
            userId.trim(),
          ])
        : await mysqlQuery<SkillRow>("SELECT * FROM skills WHERE id = ? LIMIT 1", [id]);
      const row = rows[0];
      return row ? this.hydrateDatabaseSkill(row) : null;
    }

    await this.init();
    return this.readSkillDefinition(id);
  }

  async getBundle(id: string, userId?: string): Promise<SkillBundle | null> {
    if (isMysqlConfigured()) {
      await this.init();
      const skill = await this.get(id, userId);
      if (!skill) {
        return null;
      }
      const files = await this.collectSkillFiles(this.resolveSkillDir(id, skill.path));
      return SkillBundleSchema.parse({
        skill,
        files,
      });
    }

    const skill = await this.get(id);
    if (!skill) {
      return null;
    }

    const files = await this.collectSkillFiles(this.getSkillDir(id));
    return SkillBundleSchema.parse({
      skill,
      files,
    });
  }

  async upsert(input: SkillUpsertInput, userId?: string): Promise<SkillDefinition> {
    if (isMysqlConfigured()) {
      await this.init();
      if (!userId?.trim()) {
        throw new Error("skill 缺少 userId，无法确定归属用户。");
      }
      const parsed = parseSkillMarkdown(input.skillMarkdown);
      const normalizedId = (input.id?.trim() || slugify(parsed.name)).trim();
      const existing = await this.get(normalizedId, userId);
      const nowIso = new Date().toISOString();
      const skillDir = this.getSkillDir(normalizedId);
      const normalizedMarkdown = `${input.skillMarkdown.trim()}\n`;
      await mkdir(skillDir, { recursive: true });
      await writeFile(this.getSkillMarkdownPath(normalizedId), normalizedMarkdown, "utf-8");
      const manifest = await this.readResourceManifest(skillDir);

      await mysqlExecute(
        `
          INSERT INTO skills (
            id, user_id, name, description, skill_markdown, resource_manifest_json, path, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            description = VALUES(description),
            skill_markdown = VALUES(skill_markdown),
            resource_manifest_json = VALUES(resource_manifest_json),
            path = VALUES(path),
            updated_at = VALUES(updated_at)
        `,
        [
          normalizedId,
          userId.trim(),
          parsed.name,
          parsed.description,
          normalizedMarkdown.trim(),
          JSON.stringify(manifest),
          skillDir,
          existing?.createdAt ? new Date(existing.createdAt) : new Date(nowIso),
          new Date(nowIso),
        ],
      );

      const skill = await this.get(normalizedId, userId);
      if (!skill) {
        throw new Error(`skill 保存失败: ${normalizedId}`);
      }
      return skill;
    }

    await this.init();

    const parsed = parseSkillMarkdown(input.skillMarkdown);
    const normalizedId = (input.id?.trim() || slugify(parsed.name)).trim();
    const skillDir = this.getSkillDir(normalizedId);
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      this.getSkillMarkdownPath(normalizedId),
      `${input.skillMarkdown.trim()}\n`,
      "utf-8",
    );

    const skill = await this.readSkillDefinition(normalizedId);
    if (!skill) {
      throw new Error(`skill 保存失败: ${normalizedId}`);
    }
    return skill;
  }

  async importFromDirectory(
    sourceDir: string,
    input?: { id?: string; userId?: string },
  ): Promise<SkillDefinition> {
    if (isMysqlConfigured()) {
      await this.init();
      if (!input?.userId?.trim()) {
        throw new Error("skill 缺少 userId，无法确定归属用户。");
      }

      const sourceSkillMarkdownPath = path.join(sourceDir, SKILL_MARKDOWN_FILE);
      const skillMarkdown = await readFile(sourceSkillMarkdownPath, "utf-8");
      const parsed = parseSkillMarkdown(skillMarkdown);
      const normalizedId = (input?.id?.trim() || slugify(parsed.name)).trim();
      const targetDir = this.getSkillDir(normalizedId);
      await rm(targetDir, { recursive: true, force: true });
      await mkdir(targetDir, { recursive: true });
      await this.copyDirectory(sourceDir, targetDir);
      const manifest = await this.readResourceManifest(targetDir);
      const nowIso = new Date().toISOString();
      const existing = await this.get(normalizedId, input.userId);

      await mysqlExecute(
        `
          INSERT INTO skills (
            id, user_id, name, description, skill_markdown, resource_manifest_json, path, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            user_id = VALUES(user_id),
            name = VALUES(name),
            description = VALUES(description),
            skill_markdown = VALUES(skill_markdown),
            resource_manifest_json = VALUES(resource_manifest_json),
            path = VALUES(path),
            updated_at = VALUES(updated_at)
        `,
        [
          normalizedId,
          input.userId.trim(),
          parsed.name,
          parsed.description,
          skillMarkdown.trim(),
          JSON.stringify(manifest),
          targetDir,
          existing?.createdAt ? new Date(existing.createdAt) : new Date(nowIso),
          nowIso,
        ],
      );

      const skill = await this.get(normalizedId, input.userId);
      if (!skill) {
        throw new Error(`skill 导入失败: ${normalizedId}`);
      }
      return skill;
    }

    await this.init();

    const sourceSkillMarkdownPath = path.join(sourceDir, SKILL_MARKDOWN_FILE);
    const skillMarkdown = await readFile(sourceSkillMarkdownPath, "utf-8");
    const parsed = parseSkillMarkdown(skillMarkdown);
    const normalizedId = (input?.id?.trim() || slugify(parsed.name)).trim();
    const targetDir = this.getSkillDir(normalizedId);

    await rm(targetDir, { recursive: true, force: true });
    await mkdir(targetDir, { recursive: true });
    await this.copyDirectory(sourceDir, targetDir);

    const skill = await this.readSkillDefinition(normalizedId);
    if (!skill) {
      throw new Error(`skill 导入失败: ${normalizedId}`);
    }
    return skill;
  }

  async remove(id: string, userId?: string): Promise<boolean> {
    if (isMysqlConfigured()) {
      await this.init();
      await rm(this.getSkillDir(id.trim()), { recursive: true, force: true });
      const result = userId?.trim()
        ? await mysqlExecute("DELETE FROM skills WHERE id = ? AND user_id = ?", [
            id.trim(),
            userId.trim(),
          ])
        : await mysqlExecute("DELETE FROM skills WHERE id = ?", [id.trim()]);
      return result.affectedRows > 0;
    }

    await this.init();
    try {
      await rm(this.getSkillDir(id.trim()), { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  private async readSummary(id: string): Promise<SkillSummary | null> {
    const definition = await this.readSkillDefinition(id);
    if (!definition) {
      return null;
    }
    const { skillMarkdown: _skillMarkdown, ...summary } = definition;
    return SkillSummarySchema.parse(summary);
  }

  private async readSkillDefinition(id: string, userId?: string): Promise<SkillDefinition | null> {
    if (isMysqlConfigured()) {
      const rows = userId?.trim()
        ? await mysqlQuery<SkillRow>("SELECT * FROM skills WHERE id = ? AND user_id = ? LIMIT 1", [
            id.trim(),
            userId.trim(),
          ])
        : await mysqlQuery<SkillRow>("SELECT * FROM skills WHERE id = ? LIMIT 1", [id.trim()]);
      const row = rows[0];
      return row ? this.hydrateDatabaseSkill(row) : null;
    }

    const skillDir = this.getSkillDir(id);
    try {
      const skillMarkdown = await readFile(this.getSkillMarkdownPath(id), "utf-8");
      const parsed = parseSkillMarkdown(skillMarkdown);
      const resourceManifest = await this.readResourceManifest(skillDir);
      const skillFileStats = await stat(this.getSkillMarkdownPath(id));

      return SkillDefinitionSchema.parse({
        id,
        name: parsed.name,
        description: parsed.description,
        path: skillDir,
        resourceManifest,
        skillMarkdown,
        createdAt: skillFileStats.birthtime.toISOString(),
        updatedAt: skillFileStats.mtime.toISOString(),
      });
    } catch {
      return null;
    }
  }

  private async readResourceManifest(skillDir: string): Promise<SkillResourceManifest> {
    const allFiles = await this.collectRelativeFilePaths(skillDir);
    return buildResourceManifest(allFiles);
  }

  private async collectRelativeFilePaths(directoryPath: string, prefix = ""): Promise<string[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch {
      return [];
    }

    const collected: string[] = [];
    for (const entry of entries) {
      if (entry.name === ".DS_Store") {
        continue;
      }

      const relativePath = prefix
        ? normalizeRelativePath(path.join(prefix, entry.name))
        : entry.name;
      const absolutePath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        collected.push(...(await this.collectRelativeFilePaths(absolutePath, relativePath)));
        continue;
      }

      if (entry.isFile()) {
        collected.push(relativePath);
      }
    }

    return sortPaths(collected);
  }

  private async collectSkillFiles(skillDir: string, prefix = ""): Promise<SkillBundleFile[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(skillDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const files: SkillBundleFile[] = [];
    for (const entry of entries) {
      if (entry.name === ".DS_Store") {
        continue;
      }

      const relativePath = prefix
        ? normalizeRelativePath(path.join(prefix, entry.name))
        : entry.name;
      const absolutePath = path.join(skillDir, entry.name);

      if (entry.isDirectory()) {
        files.push(...(await this.collectSkillFiles(absolutePath, relativePath)));
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const [content, fileStats] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
      files.push({
        relativePath,
        content,
        mode: fileStats.mode & 0o777,
      });
    }

    return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "en"));
  }

  private async copyDirectory(sourceDir: string, targetDir: string): Promise<void> {
    const entries = await readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".DS_Store") {
        continue;
      }

      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);

      if (entry.isDirectory()) {
        await mkdir(targetPath, { recursive: true });
        await this.copyDirectory(sourcePath, targetPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const [content, fileStats] = await Promise.all([readFile(sourcePath), stat(sourcePath)]);
      await writeFile(targetPath, content);
      await chmod(targetPath, fileStats.mode & 0o777);
    }
  }

  private resolveSkillDir(id: string, storedPath?: string): string {
    const normalizedId = id.trim();
    const fallback = this.getSkillDir(normalizedId);
    const normalizedStoredPath = (storedPath || "").trim();
    if (!normalizedStoredPath || normalizedStoredPath.startsWith("db://")) {
      return fallback;
    }
    return normalizedStoredPath;
  }

  private async hydrateDatabaseSkill(row: SkillRow): Promise<SkillDefinition> {
    const fallback = mapSkillRow(row);
    const skillDir = this.resolveSkillDir(row.id, row.path);

    try {
      const skillMarkdown = await readFile(path.join(skillDir, SKILL_MARKDOWN_FILE), "utf-8");
      const parsed = parseSkillMarkdown(skillMarkdown);
      const resourceManifest = await this.readResourceManifest(skillDir);

      return SkillDefinitionSchema.parse({
        ...fallback,
        name: parsed.name,
        description: parsed.description,
        path: skillDir,
        resourceManifest,
        skillMarkdown,
      });
    } catch {
      return SkillDefinitionSchema.parse({
        ...fallback,
        path: skillDir,
      });
    }
  }

  private getSkillDir(id: string): string {
    return path.join(this.skillsDir, id.trim());
  }

  private getSkillMarkdownPath(id: string): string {
    return path.join(this.getSkillDir(id), SKILL_MARKDOWN_FILE);
  }
}

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "skill";
